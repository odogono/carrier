import type { ZarchInputState } from './use-zarch-runtime';

export const getWorldAlignedNavigationAcceleration = (
  input: Pick<ZarchInputState, 'keys'>
) => {
  let ax = 0;
  let az = 0;

  if (input.keys.ArrowUp || input.keys.w || input.keys.W) {
    az += 1;
  }
  if (input.keys.ArrowDown || input.keys.s || input.keys.S) {
    az -= 1;
  }
  if (input.keys.ArrowLeft || input.keys.a || input.keys.A) {
    ax += 1;
  }
  if (input.keys.ArrowRight || input.keys.d || input.keys.D) {
    ax -= 1;
  }

  return { ax, az };
};
