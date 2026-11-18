import { expect, test } from "bun:test"
import { CameraRig } from "lib/viewer/camera-rig"
import { PerspectiveCamera, Vector3 } from "three"

/** Step the rig at 60 fps and return the largest move of the camera in one frame. */
function stepAndMeasure(params: {
  rig: CameraRig
  camera: PerspectiveCamera
  seconds: number
}): number {
  const { rig, camera } = params
  let largestStepM = 0
  const previous = camera.position.clone()
  for (let frame = 0; frame < params.seconds * 60; frame++) {
    rig.update({
      dtSeconds: 1 / 60,
      operatorPosition: new Vector3(),
      fallbackCloseUpTarget: new Vector3(),
    })
    largestStepM = Math.max(largestStepM, camera.position.distanceTo(previous))
    previous.copy(camera.position)
  }
  return largestStepM
}

test("switching the close-up to another bench glides there instead of cutting", () => {
  const camera = new PerspectiveCamera()
  const rig = new CameraRig(camera)
  const benchA = new Vector3(0.5, 1.1, 2)
  const benchB = new Vector3(0.5, 1.1, 7)
  rig.closeUpFocus = () => benchA.clone()
  rig.setMode({ mode: "close_up", isLandscape: true })
  rig.aimAt({ ccwYawRadians: 1.2, pitchRadians: 0.7 })
  stepAndMeasure({ rig, camera, seconds: 5 })
  expect(rig.target.distanceTo(benchA)).toBeLessThan(0.01)

  // The next step is 5 m away and seen from the other side.
  rig.closeUpFocus = () => benchB.clone()
  rig.aimAt({ ccwYawRadians: 1.2 + Math.PI, pitchRadians: 0.4 })
  const largestStepM = stepAndMeasure({ rig, camera, seconds: 6 })
  // No frame jumps more than about 30 cm: a glide, not a teleport.
  expect(largestStepM).toBeLessThan(0.3)
  expect(rig.target.distanceTo(benchB)).toBeLessThan(0.01)
  expect(rig.pitchRadians).toBeCloseTo(0.4, 2)
  expect(rig.distanceM).toBeCloseTo(rig.modeDistancesM.close_up, 1)
})

test("dragging to orbit takes over from a turn in progress", () => {
  const camera = new PerspectiveCamera()
  const rig = new CameraRig(camera)
  rig.aimAt({ ccwYawRadians: 2, pitchRadians: 0.5 })
  rig.orbit({ dxPx: 50, dyPx: 0 })
  const yaw = rig.ccwYawRadians
  stepAndMeasure({ rig, camera, seconds: 1 })
  expect(rig.ccwYawRadians).toBe(yaw)
})
