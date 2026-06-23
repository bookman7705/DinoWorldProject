/**
 * Play a named clip when configured, otherwise fall back to the first animation.
 */
export function playModelAnimation(mixer, clips, animationName) {
  if (!clips.length) {
    return;
  }

  let clip = clips[0];

  if (animationName) {
    const match = clips.find(
      (candidate) => candidate.name.toLowerCase() === animationName.toLowerCase()
    );
    if (match) {
      clip = match;
    }
  }

  mixer.clipAction(clip).play();
}
