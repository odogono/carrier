package script

import (
	"encoding/json"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestRuntimeCallsCallbacksAndPersistsState(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeScriptFile(t, dir, "counter.lua", `
return {
  on_init = function(ctx)
    ctx:set_state("init_count", (ctx:get_state("init_count") or 0) + 1)
  end,
  on_enter = function(ctx, actor)
    ctx:set_state("enter_count", (ctx:get_state("enter_count") or 0) + 1)
    ctx:set_state("last_actor_id", actor.id)
    ctx:schedule_timer("cooldown", 50)
  end,
  on_leave = function(ctx, actor)
    ctx:set_state("leave_count", (ctx:get_state("leave_count") or 0) + 1)
  end,
  on_timer = function(ctx, timer_name)
    ctx:set_state("timer_count", (ctx:get_state("timer_count") or 0) + 1)
    ctx:set_state("last_timer_name", timer_name)
  end,
}
`)

	configPath := filepath.Join(dir, "triggers.json")
	statePath := filepath.Join(dir, "script-state.json")
	writeTriggerConfig(t, configPath, map[string]any{
		"maps": map[string]any{
			"export-1": map[string]any{
				"triggers": []map[string]any{
					{
						"id":     "alpha",
						"script": "counter.lua",
						"volume": map[string]any{
							"minX": 0,
							"minZ": 0,
							"maxX": 10,
							"maxZ": 10,
						},
					},
				},
			},
		},
	})

	scheduler := newFakeScheduler()
	runtime, err := New(RuntimeOptions{
		Logger:     testLogger(),
		MapID:      "export-1",
		ScriptDir:  dir,
		ConfigPath: configPath,
		StatePath:  statePath,
		Scheduler:  scheduler,
	})
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	defer runtime.Close()

	runtime.UpdateActorPosition("player-1", 5, 5)
	scheduler.RunAll()
	runtime.UpdateActorPosition("player-1", 20, 20)

	state := readTriggerState(t, statePath, "export-1", "alpha")
	if got, want := state["init_count"], float64(1); got != want {
		t.Fatalf("got init_count %#v, want %#v", got, want)
	}
	if got, want := state["enter_count"], float64(1); got != want {
		t.Fatalf("got enter_count %#v, want %#v", got, want)
	}
	if got, want := state["leave_count"], float64(1); got != want {
		t.Fatalf("got leave_count %#v, want %#v", got, want)
	}
	if got, want := state["timer_count"], float64(1); got != want {
		t.Fatalf("got timer_count %#v, want %#v", got, want)
	}
	if got, want := state["last_actor_id"], "player-1"; got != want {
		t.Fatalf("got last_actor_id %#v, want %#v", got, want)
	}
	if got, want := state["last_timer_name"], "cooldown"; got != want {
		t.Fatalf("got last_timer_name %#v, want %#v", got, want)
	}
}

func TestRuntimeRestoresPersistedStateAcrossRestart(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeScriptFile(t, dir, "restore.lua", `
return {
  on_init = function(ctx)
    ctx:set_state("boot_count", (ctx:get_state("boot_count") or 0) + 1)
  end,
  on_enter = function(ctx, actor)
    ctx:set_state("enter_count", (ctx:get_state("enter_count") or 0) + 1)
  end,
}
`)

	configPath := filepath.Join(dir, "triggers.json")
	statePath := filepath.Join(dir, "script-state.json")
	writeTriggerConfig(t, configPath, map[string]any{
		"maps": map[string]any{
			"export-1": map[string]any{
				"triggers": []map[string]any{
					{
						"id":     "alpha",
						"script": "restore.lua",
						"volume": map[string]any{
							"minX": 0,
							"minZ": 0,
							"maxX": 10,
							"maxZ": 10,
						},
					},
				},
			},
		},
	})

	runtimeA, err := New(RuntimeOptions{
		Logger:     testLogger(),
		MapID:      "export-1",
		ScriptDir:  dir,
		ConfigPath: configPath,
		StatePath:  statePath,
	})
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	runtimeA.UpdateActorPosition("player-1", 5, 5)
	if err := runtimeA.Close(); err != nil {
		t.Fatalf("Close returned error: %v", err)
	}

	runtimeB, err := New(RuntimeOptions{
		Logger:     testLogger(),
		MapID:      "export-1",
		ScriptDir:  dir,
		ConfigPath: configPath,
		StatePath:  statePath,
	})
	if err != nil {
		t.Fatalf("second New returned error: %v", err)
	}
	defer runtimeB.Close()

	state := readTriggerState(t, statePath, "export-1", "alpha")
	if got, want := state["boot_count"], float64(2); got != want {
		t.Fatalf("got boot_count %#v, want %#v", got, want)
	}
	if got, want := state["enter_count"], float64(1); got != want {
		t.Fatalf("got enter_count %#v, want %#v", got, want)
	}
}

func TestRuntimeSandboxUsesHostControlledUtilities(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeScriptFile(t, dir, "sandbox.lua", `
return {
  on_init = function(ctx)
    assert(os == nil)
    assert(io == nil)
    assert(package == nil)
    assert(debug == nil)
    assert(math.random == nil)
    assert(math.randomseed == nil)
    assert(type(ctx:now_unix_milli()) == "number")
    assert(ctx:random_int(10) == 7)
    ctx:set_state("sandbox_ok", true)
  end,
}
`)

	configPath := filepath.Join(dir, "triggers.json")
	statePath := filepath.Join(dir, "script-state.json")
	writeTriggerConfig(t, configPath, map[string]any{
		"maps": map[string]any{
			"export-1": map[string]any{
				"triggers": []map[string]any{
					{
						"id":     "alpha",
						"script": "sandbox.lua",
						"volume": map[string]any{
							"minX": 0,
							"minZ": 0,
							"maxX": 10,
							"maxZ": 10,
						},
					},
				},
			},
		},
	})

	runtime, err := New(RuntimeOptions{
		Logger:     testLogger(),
		MapID:      "export-1",
		ScriptDir:  dir,
		ConfigPath: configPath,
		StatePath:  statePath,
		Now: func() time.Time {
			return time.UnixMilli(1234)
		},
		RandomIntn: func(int) int {
			return 7
		},
	})
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	defer runtime.Close()

	state := readTriggerState(t, statePath, "export-1", "alpha")
	if got, want := state["sandbox_ok"], true; got != want {
		t.Fatalf("got sandbox_ok %#v, want %#v", got, want)
	}
}

func TestRuntimeDisablesFailingTriggerWithoutAffectingOthers(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeScriptFile(t, dir, "good.lua", `
return {
  on_enter = function(ctx, actor)
    ctx:set_state("enter_count", (ctx:get_state("enter_count") or 0) + 1)
  end,
}
`)
	writeScriptFile(t, dir, "bad.lua", `
return {
  on_enter = function(ctx, actor)
    error("boom")
  end,
}
`)

	configPath := filepath.Join(dir, "triggers.json")
	statePath := filepath.Join(dir, "script-state.json")
	writeTriggerConfig(t, configPath, map[string]any{
		"maps": map[string]any{
			"export-1": map[string]any{
				"triggers": []map[string]any{
					{
						"id":     "good-a",
						"script": "good.lua",
						"volume": map[string]any{"minX": 0, "minZ": 0, "maxX": 10, "maxZ": 10},
					},
					{
						"id":     "good-b",
						"script": "good.lua",
						"volume": map[string]any{"minX": 0, "minZ": 0, "maxX": 10, "maxZ": 10},
					},
					{
						"id":     "bad",
						"script": "bad.lua",
						"volume": map[string]any{"minX": 0, "minZ": 0, "maxX": 10, "maxZ": 10},
					},
				},
			},
		},
	})

	runtime, err := New(RuntimeOptions{
		Logger:     testLogger(),
		MapID:      "export-1",
		ScriptDir:  dir,
		ConfigPath: configPath,
		StatePath:  statePath,
	})
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	defer runtime.Close()

	runtime.UpdateActorPosition("player-1", 5, 5)
	runtime.UpdateActorPosition("player-1", 20, 20)
	runtime.UpdateActorPosition("player-1", 5, 5)

	goodA := readTriggerState(t, statePath, "export-1", "good-a")
	if got, want := goodA["enter_count"], float64(2); got != want {
		t.Fatalf("got good-a enter_count %#v, want %#v", got, want)
	}
	goodB := readTriggerState(t, statePath, "export-1", "good-b")
	if got, want := goodB["enter_count"], float64(2); got != want {
		t.Fatalf("got good-b enter_count %#v, want %#v", got, want)
	}

	badState := readTriggerState(t, statePath, "export-1", "bad")
	if got, ok := badState["enter_count"]; ok {
		t.Fatalf("expected bad trigger to stay disabled, got enter_count %#v", got)
	}
}

func TestRuntimeReloadsScriptsInDevModeWithoutLosingState(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	scriptPath := writeScriptFile(t, dir, "reload.lua", `
return {
  on_enter = function(ctx, actor)
    ctx:set_state("enter_count", (ctx:get_state("enter_count") or 0) + 1)
  end,
}
`)

	configPath := filepath.Join(dir, "triggers.json")
	statePath := filepath.Join(dir, "script-state.json")
	writeTriggerConfig(t, configPath, map[string]any{
		"maps": map[string]any{
			"export-1": map[string]any{
				"triggers": []map[string]any{
					{
						"id":     "alpha",
						"script": "reload.lua",
						"volume": map[string]any{"minX": 0, "minZ": 0, "maxX": 10, "maxZ": 10},
					},
				},
			},
		},
	})

	runtime, err := New(RuntimeOptions{
		Logger:              testLogger(),
		MapID:               "export-1",
		ScriptDir:           dir,
		ConfigPath:          configPath,
		StatePath:           statePath,
		DevMode:             true,
		ReloadCheckInterval: -1,
	})
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	defer runtime.Close()

	runtime.UpdateActorPosition("player-1", 5, 5)
	runtime.UpdateActorPosition("player-1", 20, 20)

	writeScriptFile(t, dir, "reload.lua", `
return {
  on_enter = function(ctx, actor)
    ctx:set_state("enter_count", (ctx:get_state("enter_count") or 0) + 10)
  end,
}
`)
	nextModTime := time.Now().Add(2 * time.Second)
	if err := os.Chtimes(scriptPath, nextModTime, nextModTime); err != nil {
		t.Fatalf("Chtimes returned error: %v", err)
	}

	runtime.UpdateActorPosition("player-1", 5, 5)

	state := readTriggerState(t, statePath, "export-1", "alpha")
	if got, want := state["enter_count"], float64(11); got != want {
		t.Fatalf("got enter_count %#v, want %#v", got, want)
	}
}

type fakeScheduler struct {
	nextID int
	timers map[int]func()
}

func newFakeScheduler() *fakeScheduler {
	return &fakeScheduler{
		timers: make(map[int]func()),
	}
}

func (s *fakeScheduler) AfterFunc(_ time.Duration, fn func()) TimerHandle {
	s.nextID++
	id := s.nextID
	s.timers[id] = fn
	return fakeTimerHandle(func() bool {
		if _, ok := s.timers[id]; !ok {
			return false
		}
		delete(s.timers, id)
		return true
	})
}

func (s *fakeScheduler) RunAll() {
	for len(s.timers) > 0 {
		current := make([]func(), 0, len(s.timers))
		for id, fn := range s.timers {
			current = append(current, fn)
			delete(s.timers, id)
		}
		for _, fn := range current {
			fn()
		}
	}
}

type fakeTimerHandle func() bool

func (fn fakeTimerHandle) Stop() bool {
	return fn()
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func writeScriptFile(t *testing.T, dir, name, contents string) string {
	t.Helper()

	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatalf("WriteFile(%s) returned error: %v", name, err)
	}
	return path
}

func writeTriggerConfig(t *testing.T, path string, value any) {
	t.Helper()

	bytes, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatalf("MarshalIndent returned error: %v", err)
	}
	if err := os.WriteFile(path, bytes, 0o644); err != nil {
		t.Fatalf("WriteFile(%s) returned error: %v", path, err)
	}
}

func readTriggerState(t *testing.T, path, mapID, triggerID string) map[string]any {
	t.Helper()

	bytes, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(%s) returned error: %v", path, err)
	}

	var payload struct {
		Maps map[string]map[string]map[string]any `json:"maps"`
	}
	if err := json.Unmarshal(bytes, &payload); err != nil {
		t.Fatalf("Unmarshal returned error: %v", err)
	}

	triggerState := payload.Maps[mapID][triggerID]
	if triggerState == nil {
		return map[string]any{}
	}

	return triggerState
}
