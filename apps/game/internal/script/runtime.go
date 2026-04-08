package script

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/rand"
	"os"
	"path/filepath"
	"sync"
	"time"

	lua "github.com/yuin/gopher-lua"
)

type TimerHandle interface {
	Stop() bool
}

type Scheduler interface {
	AfterFunc(delay time.Duration, fn func()) TimerHandle
}

type RuntimeOptions struct {
	ConfigPath          string
	DevMode             bool
	Logger              *slog.Logger
	MapID               string
	Now                 func() time.Time
	RandomIntn          func(maxExclusive int) int
	ReloadCheckInterval time.Duration
	Scheduler           Scheduler
	ScriptDir           string
	StatePath           string
}

type Runtime struct {
	actors              map[string]actorPosition
	configPath          string
	devMode             bool
	lastReloadScan      time.Time
	logger              *slog.Logger
	l                   *lua.LState
	mapID               string
	mu                  sync.Mutex
	now                 func() time.Time
	randomIntn          func(maxExclusive int) int
	reloadCheckInterval time.Duration
	scheduler           Scheduler
	scriptDir           string
	state               persistedStateFile
	statePath           string
	triggers            map[string]*triggerRuntime
	watchedFiles        map[string]watchedFileState
}

type actorPosition struct {
	X float64
	Z float64
}

const (
	callbackOnInit  = "on_init"
	callbackOnEnter = "on_enter"
	callbackOnLeave = "on_leave"
	callbackOnTimer = "on_timer"
)

const defaultReloadCheckInterval = time.Second

type BoxVolume struct {
	MinX float64 `json:"minX"`
	MinZ float64 `json:"minZ"`
	MaxX float64 `json:"maxX"`
	MaxZ float64 `json:"maxZ"`
}

func (v BoxVolume) Contains(x, z float64) bool {
	return x >= v.MinX && x <= v.MaxX && z >= v.MinZ && z <= v.MaxZ
}

type TriggerDefinition struct {
	ID      string         `json:"id"`
	Params  map[string]any `json:"params,omitempty"`
	Script  string         `json:"script"`
	Volume  BoxVolume      `json:"volume"`
	Enabled *bool          `json:"enabled,omitempty"`
}

type triggerConfigFile struct {
	Maps map[string]triggerMapConfig `json:"maps"`
}

type triggerMapConfig struct {
	Triggers []TriggerDefinition `json:"triggers"`
}

type persistedStateFile struct {
	Maps map[string]map[string]map[string]any `json:"maps"`
}

type watchedFileState struct {
	Exists  bool
	ModTime time.Time
}

type triggerTimer struct {
	Handle TimerHandle
	Token  int
}

type triggerRuntime struct {
	Context        *lua.LTable
	Definition     TriggerDefinition
	Disabled       bool
	Module         *lua.LTable
	NextTimerToken int
	Occupied       map[string]struct{}
	State          map[string]any
	Timers         map[string]triggerTimer
}

type realScheduler struct{}

type stdlibTimer struct {
	timer *time.Timer
}

func New(options RuntimeOptions) (*Runtime, error) {
	logger := options.Logger
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(os.Stderr, nil))
	}

	now := options.Now
	if now == nil {
		now = time.Now
	}

	randomIntn := options.RandomIntn
	if randomIntn == nil {
		source := rand.New(rand.NewSource(now().UnixNano()))
		randomIntn = source.Intn
	}

	scheduler := options.Scheduler
	if scheduler == nil {
		scheduler = realScheduler{}
	}

	reloadCheckInterval := options.ReloadCheckInterval
	if reloadCheckInterval == 0 {
		reloadCheckInterval = defaultReloadCheckInterval
	}
	if reloadCheckInterval < 0 {
		reloadCheckInterval = 0
	}

	runtime := &Runtime{
		actors:              make(map[string]actorPosition),
		configPath:          options.ConfigPath,
		devMode:             options.DevMode,
		logger:              logger,
		mapID:               options.MapID,
		now:                 now,
		randomIntn:          randomIntn,
		reloadCheckInterval: reloadCheckInterval,
		scheduler:           scheduler,
		scriptDir:           options.ScriptDir,
		statePath:           options.StatePath,
		triggers:            make(map[string]*triggerRuntime),
		watchedFiles:        make(map[string]watchedFileState),
	}

	if err := runtime.loadStateLocked(); err != nil {
		return nil, err
	}
	if err := runtime.reloadLocked(); err != nil {
		return nil, err
	}

	return runtime, nil
}

func (r *Runtime) UpdateActorPosition(actorID string, x, z float64) {
	if actorID == "" {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	r.ensureFreshLocked()

	if previous, ok := r.actors[actorID]; ok && previous.X == x && previous.Z == z {
		return
	}
	r.actors[actorID] = actorPosition{X: x, Z: z}

	for _, trigger := range r.triggers {
		if trigger.Disabled {
			continue
		}

		_, occupied := trigger.Occupied[actorID]
		inside := trigger.Definition.Volume.Contains(x, z)
		switch {
		case inside && !occupied:
			if err := r.invokeTriggerCallbackLocked(trigger, callbackOnEnter, actorID, x, z, ""); err != nil {
				r.disableTriggerLocked(trigger, "enter callback failed", err)
				continue
			}
			trigger.Occupied[actorID] = struct{}{}
		case !inside && occupied:
			delete(trigger.Occupied, actorID)
			if err := r.invokeTriggerCallbackLocked(trigger, callbackOnLeave, actorID, x, z, ""); err != nil {
				r.disableTriggerLocked(trigger, "leave callback failed", err)
			}
		}
	}
}

func (r *Runtime) RemoveActor(actorID string) {
	if actorID == "" {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	r.ensureFreshLocked()

	position, ok := r.actors[actorID]
	if ok {
		delete(r.actors, actorID)
	}

	for _, trigger := range r.triggers {
		if _, occupied := trigger.Occupied[actorID]; !occupied {
			continue
		}
		delete(trigger.Occupied, actorID)
		if trigger.Disabled {
			continue
		}
		if err := r.invokeTriggerCallbackLocked(trigger, callbackOnLeave, actorID, position.X, position.Z, ""); err != nil {
			r.disableTriggerLocked(trigger, "leave callback failed", err)
		}
	}
}

func (r *Runtime) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.cancelAllTimersLocked()
	if r.l != nil {
		r.l.Close()
		r.l = nil
	}
	return nil
}

func (realScheduler) AfterFunc(delay time.Duration, fn func()) TimerHandle {
	return &stdlibTimer{timer: time.AfterFunc(delay, fn)}
}

func (h *stdlibTimer) Stop() bool {
	if h == nil || h.timer == nil {
		return false
	}
	return h.timer.Stop()
}

func (r *Runtime) ensureFreshLocked() {
	if !r.devMode {
		return
	}
	if r.reloadCheckInterval > 0 {
		now := r.now()
		if !r.lastReloadScan.IsZero() && now.Sub(r.lastReloadScan) < r.reloadCheckInterval {
			return
		}
		r.lastReloadScan = now
	}
	if !r.haveWatchedFilesChangedLocked() {
		return
	}
	if err := r.reloadLocked(); err != nil {
		r.logger.Error("script runtime reload failed", "map", r.mapID, "error", err)
	}
}

func (r *Runtime) haveWatchedFilesChangedLocked() bool {
	for path, previous := range r.watchedFiles {
		info, err := os.Stat(path)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				if previous.Exists {
					return true
				}
				continue
			}
			r.logger.Warn("stat failed while checking for script reload", "path", path, "error", err)
			continue
		}
		if !previous.Exists || info.ModTime().After(previous.ModTime) {
			return true
		}
	}
	return false
}

func (r *Runtime) reloadLocked() error {
	config, watchedFiles, err := loadTriggerDefinitions(r.configPath, r.mapID)
	if err != nil {
		return err
	}

	previousTriggers := r.triggers
	previousLState := r.l

	nextLState := newRestrictedLuaState()
	nextTriggers := make(map[string]*triggerRuntime, len(config))

	for _, definition := range config {
		module, scriptPath, info, err := loadLuaModule(nextLState, r.scriptDir, definition.Script)
		if err != nil {
			nextLState.Close()
			return err
		}
		watchedFiles[scriptPath] = watchedFileState{
			Exists:  true,
			ModTime: info.ModTime(),
		}

		triggerState := r.triggerStateLocked(definition.ID)
		nextTrigger := &triggerRuntime{
			Definition: definition,
			Module:     module,
			Occupied:   make(map[string]struct{}),
			State:      triggerState,
			Timers:     make(map[string]triggerTimer),
		}
		nextTrigger.Context = r.buildContextForLocked(nextLState, nextTrigger)

		if previous := previousTriggers[definition.ID]; previous != nil {
			for actorID := range previous.Occupied {
				nextTrigger.Occupied[actorID] = struct{}{}
			}
		}

		nextTriggers[definition.ID] = nextTrigger
	}

	r.cancelAllTimersLocked()
	r.l = nextLState
	r.triggers = nextTriggers
	r.watchedFiles = watchedFiles

	for _, trigger := range r.triggers {
		if err := r.invokeTriggerCallbackLocked(trigger, callbackOnInit, "", 0, 0, ""); err != nil {
			r.disableTriggerLocked(trigger, "init callback failed", err)
		}
	}

	if previousLState != nil {
		previousLState.Close()
	}

	return nil
}

func loadTriggerDefinitions(configPath, mapID string) ([]TriggerDefinition, map[string]watchedFileState, error) {
	watchedFiles := make(map[string]watchedFileState)
	if configPath == "" {
		return nil, watchedFiles, nil
	}

	info, err := os.Stat(configPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			watchedFiles[configPath] = watchedFileState{}
			return nil, watchedFiles, nil
		}
		return nil, nil, fmt.Errorf("stat trigger config: %w", err)
	}
	watchedFiles[configPath] = watchedFileState{
		Exists:  true,
		ModTime: info.ModTime(),
	}

	bytes, err := os.ReadFile(configPath)
	if err != nil {
		return nil, nil, fmt.Errorf("read trigger config: %w", err)
	}

	var payload triggerConfigFile
	if err := json.Unmarshal(bytes, &payload); err != nil {
		return nil, nil, fmt.Errorf("decode trigger config: %w", err)
	}

	entry := payload.Maps[mapID]
	for index, trigger := range entry.Triggers {
		if trigger.ID == "" {
			return nil, nil, fmt.Errorf("trigger %d is missing id", index)
		}
		if trigger.Script == "" {
			return nil, nil, fmt.Errorf("trigger %s is missing script", trigger.ID)
		}
	}

	return entry.Triggers, watchedFiles, nil
}

func loadLuaModule(state *lua.LState, scriptDir, scriptName string) (*lua.LTable, string, os.FileInfo, error) {
	if scriptDir == "" {
		return nil, "", nil, fmt.Errorf("script directory is required")
	}

	scriptPath := filepath.Join(scriptDir, scriptName)
	info, err := os.Stat(scriptPath)
	if err != nil {
		return nil, "", nil, fmt.Errorf("stat script %s: %w", scriptName, err)
	}

	function, err := state.LoadFile(scriptPath)
	if err != nil {
		return nil, "", nil, fmt.Errorf("load script %s: %w", scriptName, err)
	}

	if err := state.CallByParam(lua.P{
		Fn:      function,
		NRet:    1,
		Protect: true,
	}); err != nil {
		return nil, "", nil, fmt.Errorf("execute script %s: %w", scriptName, err)
	}

	value := state.Get(-1)
	state.Pop(1)

	table, ok := value.(*lua.LTable)
	if !ok {
		return nil, "", nil, fmt.Errorf("script %s must return a table", scriptName)
	}

	return table, scriptPath, info, nil
}

func newRestrictedLuaState() *lua.LState {
	state := lua.NewState(lua.Options{SkipOpenLibs: true})
	lua.OpenBase(state)
	lua.OpenTable(state)
	lua.OpenString(state)
	lua.OpenMath(state)

	// OpenBase installs these filesystem/loader helpers; remove them so scripts
	// cannot break out of the sandbox. Other libraries (os, io, debug, package)
	// are never opened thanks to SkipOpenLibs.
	state.SetGlobal("dofile", lua.LNil)
	state.SetGlobal("load", lua.LNil)
	state.SetGlobal("loadfile", lua.LNil)
	state.SetGlobal("require", lua.LNil)

	mathValue := state.GetGlobal("math")
	if mathTable, ok := mathValue.(*lua.LTable); ok {
		state.SetField(mathTable, "random", lua.LNil)
		state.SetField(mathTable, "randomseed", lua.LNil)
	}

	return state
}

func (r *Runtime) invokeTriggerCallbackLocked(trigger *triggerRuntime, callbackName, actorID string, x, z float64, timerName string) error {
	value := trigger.Module.RawGetString(callbackName)
	if value == lua.LNil {
		return nil
	}

	callback, ok := value.(*lua.LFunction)
	if !ok {
		return fmt.Errorf("%s is not a function", callbackName)
	}

	args := []lua.LValue{trigger.Context}
	switch callbackName {
	case callbackOnEnter, callbackOnLeave:
		args = append(args, r.buildActor(actorID, x, z))
	case callbackOnTimer:
		args = append(args, lua.LString(timerName))
	}

	if err := r.l.CallByParam(lua.P{
		Fn:      callback,
		NRet:    0,
		Protect: true,
	}, args...); err != nil {
		return err
	}

	return nil
}

func (r *Runtime) buildContextForLocked(l *lua.LState, trigger *triggerRuntime) *lua.LTable {
	ctxTable := l.NewTable()

	l.SetField(ctxTable, "trigger_id", l.NewFunction(func(state *lua.LState) int {
		state.Push(lua.LString(trigger.Definition.ID))
		return 1
	}))
	l.SetField(ctxTable, "get_param", l.NewFunction(func(state *lua.LState) int {
		key := state.CheckString(2)
		state.Push(toLuaValue(state, trigger.Definition.Params[key]))
		return 1
	}))
	l.SetField(ctxTable, "get_state", l.NewFunction(func(state *lua.LState) int {
		key := state.CheckString(2)
		state.Push(toLuaValue(state, trigger.State[key]))
		return 1
	}))
	l.SetField(ctxTable, "set_state", l.NewFunction(func(state *lua.LState) int {
		key := state.CheckString(2)
		value, err := fromLuaValue(state.Get(3))
		if err != nil {
			state.RaiseError("set_state: %v", err)
			return 0
		}
		trigger.State[key] = value
		if err := r.persistLocked(); err != nil {
			state.RaiseError("set_state: %v", err)
			return 0
		}
		return 0
	}))
	l.SetField(ctxTable, "delete_state", l.NewFunction(func(state *lua.LState) int {
		key := state.CheckString(2)
		delete(trigger.State, key)
		if err := r.persistLocked(); err != nil {
			state.RaiseError("delete_state: %v", err)
			return 0
		}
		return 0
	}))
	l.SetField(ctxTable, "schedule_timer", l.NewFunction(func(state *lua.LState) int {
		name := state.CheckString(2)
		delayMillis := time.Duration(state.CheckInt(3)) * time.Millisecond
		r.scheduleTimerLocked(trigger, name, delayMillis)
		return 0
	}))
	l.SetField(ctxTable, "cancel_timer", l.NewFunction(func(state *lua.LState) int {
		name := state.CheckString(2)
		r.cancelTimerLocked(trigger, name)
		return 0
	}))
	l.SetField(ctxTable, "log", l.NewFunction(func(state *lua.LState) int {
		level := state.OptString(2, "info")
		message := state.CheckString(3)
		r.logger.Log(context.Background(), parseLogLevel(level), "lua trigger", "trigger", trigger.Definition.ID, "message", message)
		return 0
	}))
	l.SetField(ctxTable, "now_unix_milli", l.NewFunction(func(state *lua.LState) int {
		state.Push(lua.LNumber(r.now().UnixMilli()))
		return 1
	}))
	l.SetField(ctxTable, "random_int", l.NewFunction(func(state *lua.LState) int {
		maxExclusive := state.CheckInt(2)
		if maxExclusive <= 0 {
			state.RaiseError("random_int: maxExclusive must be positive")
			return 0
		}
		state.Push(lua.LNumber(r.randomIntn(maxExclusive)))
		return 1
	}))

	return ctxTable
}

func (r *Runtime) buildActor(actorID string, x, z float64) *lua.LTable {
	actor := r.l.NewTable()
	r.l.SetField(actor, "id", lua.LString(actorID))
	r.l.SetField(actor, "x", lua.LNumber(x))
	r.l.SetField(actor, "z", lua.LNumber(z))
	return actor
}

func (r *Runtime) scheduleTimerLocked(trigger *triggerRuntime, name string, delay time.Duration) {
	r.cancelTimerLocked(trigger, name)

	trigger.NextTimerToken++
	token := trigger.NextTimerToken

	handle := r.scheduler.AfterFunc(delay, func() {
		r.fireTimer(trigger.Definition.ID, name, token)
	})
	trigger.Timers[name] = triggerTimer{
		Handle: handle,
		Token:  token,
	}
}

func (r *Runtime) cancelTimerLocked(trigger *triggerRuntime, name string) {
	timer, ok := trigger.Timers[name]
	if !ok {
		return
	}
	timer.Handle.Stop()
	delete(trigger.Timers, name)
}

func (r *Runtime) fireTimer(triggerID, name string, token int) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.ensureFreshLocked()

	trigger := r.triggers[triggerID]
	if trigger == nil || trigger.Disabled {
		return
	}

	timer, ok := trigger.Timers[name]
	if !ok || timer.Token != token {
		return
	}
	delete(trigger.Timers, name)

	if err := r.invokeTriggerCallbackLocked(trigger, callbackOnTimer, "", 0, 0, name); err != nil {
		r.disableTriggerLocked(trigger, "timer callback failed", err)
	}
}

func (r *Runtime) disableTriggerLocked(trigger *triggerRuntime, message string, err error) {
	trigger.Disabled = true
	for name := range trigger.Timers {
		r.cancelTimerLocked(trigger, name)
	}
	r.logger.Error(message, "map", r.mapID, "trigger", trigger.Definition.ID, "error", err)
}

func (r *Runtime) cancelAllTimersLocked() {
	for _, trigger := range r.triggers {
		for name := range trigger.Timers {
			r.cancelTimerLocked(trigger, name)
		}
	}
}

func (r *Runtime) loadStateLocked() error {
	r.state = persistedStateFile{
		Maps: make(map[string]map[string]map[string]any),
	}

	if r.statePath == "" {
		return nil
	}

	if err := os.MkdirAll(filepath.Dir(r.statePath), 0o755); err != nil {
		return fmt.Errorf("create script state directory: %w", err)
	}

	bytes, err := os.ReadFile(r.statePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("read script state: %w", err)
	}
	if len(bytes) == 0 {
		return nil
	}

	if err := json.Unmarshal(bytes, &r.state); err != nil {
		return fmt.Errorf("decode script state: %w", err)
	}
	if r.state.Maps == nil {
		r.state.Maps = make(map[string]map[string]map[string]any)
	}
	return nil
}

func (r *Runtime) triggerStateLocked(triggerID string) map[string]any {
	if r.state.Maps == nil {
		r.state.Maps = make(map[string]map[string]map[string]any)
	}

	mapState := r.state.Maps[r.mapID]
	if mapState == nil {
		mapState = make(map[string]map[string]any)
		r.state.Maps[r.mapID] = mapState
	}

	triggerState := mapState[triggerID]
	if triggerState == nil {
		triggerState = make(map[string]any)
		mapState[triggerID] = triggerState
	}

	return triggerState
}

func (r *Runtime) persistLocked() error {
	if r.statePath == "" {
		return nil
	}

	bytes, err := json.MarshalIndent(r.state, "", "  ")
	if err != nil {
		return fmt.Errorf("encode script state: %w", err)
	}

	tempPath := r.statePath + ".tmp"
	if err := os.WriteFile(tempPath, bytes, 0o644); err != nil {
		return fmt.Errorf("write script state temp file: %w", err)
	}
	if err := os.Rename(tempPath, r.statePath); err != nil {
		return fmt.Errorf("replace script state file: %w", err)
	}

	return nil
}

func toLuaValue(state *lua.LState, value any) lua.LValue {
	switch typed := value.(type) {
	case nil:
		return lua.LNil
	case bool:
		return lua.LBool(typed)
	case string:
		return lua.LString(typed)
	case float64:
		return lua.LNumber(typed)
	case float32:
		return lua.LNumber(typed)
	case int:
		return lua.LNumber(typed)
	case int32:
		return lua.LNumber(typed)
	case int64:
		return lua.LNumber(typed)
	case uint:
		return lua.LNumber(typed)
	case uint32:
		return lua.LNumber(typed)
	case uint64:
		return lua.LNumber(typed)
	default:
		return lua.LNil
	}
}

func fromLuaValue(value lua.LValue) (any, error) {
	switch typed := value.(type) {
	case *lua.LNilType:
		return nil, nil
	case lua.LBool:
		return bool(typed), nil
	case lua.LString:
		return string(typed), nil
	case lua.LNumber:
		return float64(typed), nil
	default:
		return nil, fmt.Errorf("unsupported state value type %s", value.Type())
	}
}

func parseLogLevel(value string) slog.Level {
	switch value {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
