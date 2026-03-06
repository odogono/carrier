import { type RefObject, useEffect, useState } from 'react';

import {
  DEFAULT_BEST,
  DEFAULT_WAVE,
  SCORE_POLL_MS
} from '@/helpers/zarch-terrain';

import type { ZarchRuntimeState } from './use-zarch-runtime';

type ZarchHudProps = {
  runtimeRef: RefObject<ZarchRuntimeState>;
};

export const ZarchHud = ({ runtimeRef }: ZarchHudProps) => {
  const [score, setScore] = useState(0);

  useEffect(() => {
    const updateScore = () => {
      setScore(Math.round(runtimeRef.current?.score ?? 0));
    };

    updateScore();

    const intervalId = window.setInterval(updateScore, SCORE_POLL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [runtimeRef]);

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-6 border-b-2 border-[#c8a000] bg-[#111] px-3 py-1 pr-20 font-mono text-[13px] text-[#e8d060]">
        <span className="text-[#ff6060]">Score: {score}</span>
        <span>🚀</span>
        <span className="text-[15px] font-bold text-[#60b8ff]">Zarch</span>
        <span>💣</span>
        <span>Wave: {DEFAULT_WAVE}</span>
        <span className="ml-auto">Best: {DEFAULT_BEST}</span>
      </div>

      <div className="pointer-events-none absolute bottom-2 right-2 z-10 text-right font-mono text-[11px] leading-relaxed text-[#555]">
        <div>WASD / Arrow keys - move</div>
        <div>Mouse drag - rotate</div>
        <div>Scroll / Q / E - zoom</div>
      </div>
    </>
  );
};
