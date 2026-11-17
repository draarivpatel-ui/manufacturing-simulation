import { STATIONS, TABLE_PLACEMENTS } from "lib/layout/station-layout"
import { PRINTER_STATUS_COLORS } from "lib/models/bambu-printer"
import {
  getEngravePointOnSlot,
  LASER_BOXES_PER_RUN,
  OMNI_X,
} from "lib/models/uv-laser"
import {
  isBoxEngraved,
  setBoxEngraved,
  WHITE_MAILER_BOX,
  type WhiteMailerBox,
} from "lib/models/white-mailer-box"
import type { SimContext } from "lib/simulation/sim-context"
import { playCue } from "lib/simulation/sound-cues"
import { pickUpInFront, setDownFromCarry } from "lib/tasks/carry-motions"
import {
  runInParallel,
  type SimTask,
  tween,
  waitSeconds,
} from "lib/tasks/coroutines"
import {
  grabObject,
  moveObject,
  releaseHand,
  walkToStation,
} from "lib/tasks/operator-motions"
import {
  IDENTITY_QUATERNION,
  LASER_BENCH_SPOTS,
  PACK_OUT_BENCH_SPOTS,
} from "lib/world/bench-spots"
import {
  getPackOutBoxPosition,
  type UvLaserState,
} from "lib/world/create-world"
import { Group, Object3D, type Quaternion, Vector3 } from "three"

/** Homing, LiDAR autofocus and framing before the first box. */
export const LASER_FRAMING_SECONDS = 20
/** "Made in China" on one box, including the slide moving it under the galvo. */
export const LASER_SECONDS_PER_BOX = 12
const BOX_PITCH_X_M = WHITE_MAILER_BOX.lengthM + 0.004
const BOX_PITCH_Y_M = WHITE_MAILER_BOX.heightM + 0.004
const UP = new Vector3(0, 1, 0)

const LASER_CLOSE_UP = {
  azimuthRadians: 0.9,
  elevationRadians: 0.55,
  distanceM: 1.1,
}

function getLaser(ctx: SimContext): UvLaserState {
  const { uvLaser } = ctx.world
  if (!uvLaser) throw new Error("This line has no UV laser")
  return uvLaser
}

/** A kit box is ready to pack once it's engraved and sitting at pack-out. */
export function isBoxAtPackOut(box: WhiteMailerBox, ctx: SimContext): boolean {
  return (
    isBoxEngraved(box) && box.group.parent === ctx.world.tables.pack_out_bench
  )
}

/** Engraved boxes on the slide, waiting to be unloaded. */
export function countEngravedOnSlide(ctx: SimContext): number {
  const laser = ctx.world.uvLaser
  if (!laser || laser.isEngraving) return 0
  return laser.loadedBoxes.filter((box) => isBoxEngraved(box)).length
}

/** Whether there's anything for the operator to do at the laser now. */
export function hasLaserWork(ctx: SimContext): boolean {
  const laser = ctx.world.uvLaser
  if (!laser || laser.isEngraving) return false
  return laser.loadedBoxes.length > 0 || laser.blankBoxes.length > 0
}

/** What the laser job would do, for the action prompt. */
export function getLaserJobLabel(ctx: SimContext): string {
  const laser = getLaser(ctx)
  const done = countEngravedOnSlide(ctx)
  const next = Math.min(LASER_BOXES_PER_RUN, laser.blankBoxes.length)
  if (done > 0 && next > 0)
    return `take ${done} engraved boxes to pack-out and start ${next} more on the UV laser`
  if (done > 0) return `take ${done} engraved boxes to pack-out`
  return `load ${next} blank boxes into the UV laser and start it`
}

/** Short status for the laser's sign and the HUD. */
export function getLaserStatusText(laser: UvLaserState): string {
  if (laser.isEngraving) {
    const boxIndex = Math.min(
      laser.loadedBoxes.length,
      Math.max(
        0,
        Math.floor(
          (laser.engravedSeconds - LASER_FRAMING_SECONDS) /
            LASER_SECONDS_PER_BOX,
        ) + 1,
      ),
    )
    const remaining = Math.max(
      0,
      Math.ceil(laser.runSeconds - laser.engravedSeconds),
    )
    return boxIndex === 0
      ? `UV laser: framing, ${remaining} s left`
      : `UV laser: engraving box ${boxIndex} of ${laser.loadedBoxes.length}, ${remaining} s left`
  }
  if (laser.loadedBoxes.length > 0)
    return `UV laser: ${laser.loadedBoxes.length} boxes engraved`
  return laser.blankBoxes.length > 0
    ? `UV laser: idle, ${laser.blankBoxes.length} blank boxes`
    : "UV laser: idle, all boxes engraved"
}

/** Point the beam from the galvo head at a box's engraving spot (machine coordinates). */
function aimBeam(params: { laser: UvLaserState; slotIndex: number }): void {
  const { laser: state, slotIndex } = params
  const { laser } = state
  const box = state.loadedBoxes[slotIndex]
  const target = getEngravePointOnSlot({
    slot: laser.slots[slotIndex],
    engravingSpot: box.engraving.position,
  }).add(laser.slide.position)
  const direction = target.clone().sub(laser.headPoint)
  const lengthM = direction.length()
  laser.beam.position.copy(laser.headPoint).addScaledVector(direction, 0.5)
  laser.beam.scale.set(1, lengthM, 1)
  laser.beam.quaternion.setFromUnitVectors(UP, direction.normalize())
  laser.beamSpot.position.copy(target)
}

/** Run the engraving forward: each box gets its mark as its turn finishes. */
export function advanceUvLaser(
  params: { dtSeconds: number },
  ctx: SimContext,
): void {
  const laser = ctx.world.uvLaser
  if (!laser || !laser.isEngraving) return
  laser.engravedSeconds += params.dtSeconds
  const burning = Math.floor(
    (laser.engravedSeconds - LASER_FRAMING_SECONDS) / LASER_SECONDS_PER_BOX,
  )
  for (const [index, box] of laser.loadedBoxes.entries())
    if (index < burning && !isBoxEngraved(box))
      setBoxEngraved({ box, isEngraved: true })
  const isBurning = burning >= 0 && burning < laser.loadedBoxes.length
  laser.laser.beam.visible = isBurning
  laser.laser.beamSpot.visible = isBurning
  if (isBurning) aimBeam({ laser, slotIndex: burning })
  if (laser.engravedSeconds < laser.runSeconds) return
  for (const box of laser.loadedBoxes) setBoxEngraved({ box, isEngraved: true })
  laser.isEngraving = false
  laser.laser.beam.visible = false
  laser.laser.beamSpot.visible = false
  laser.laser.statusLight.material.color.setHex(PRINTER_STATUS_COLORS.ready)
  playCue("print_done", ctx)
}

/** Finish the running engraving now, as if its time had passed. */
export function finishEngravingNow(ctx: SimContext): void {
  const laser = ctx.world.uvLaser
  if (!laser || !laser.isEngraving) return
  advanceUvLaser({ dtSeconds: laser.runSeconds }, ctx)
}

function* slideTo(params: { laser: UvLaserState; isOut: boolean }): SimTask {
  const { slide } = params.laser.laser
  const fromZ = slide.position.z
  const toZ = params.isOut ? OMNI_X.slideOutZM : 0
  yield* tween({
    durationSeconds: 0.9,
    onProgress: (progress) => {
      slide.position.z = fromZ + (toZ - fromZ) * progress
    },
  })
}

/** Where engraved box `index` of a run waits on the bench, two wide and three high. */
function getBundlePosition(index: number): Vector3 {
  const column = index % 2
  const level = Math.floor(index / 2)
  return new Vector3((column - 0.5) * BOX_PITCH_X_M, level * BOX_PITCH_Y_M, 0)
}

/** Move one box with one hand, from wherever it is to a pose under `parent`. */
function* handBox(
  params: {
    box: WhiteMailerBox
    parent: Object3D
    position: Vector3
    quaternion: Quaternion
    useLeftHand: boolean
  },
  ctx: SimContext,
): SimTask {
  const hand = params.useLeftHand
    ? ctx.operator.leftHand
    : ctx.operator.rightHand
  yield* grabObject({
    hand,
    object: params.box.group,
    localGripPoint: new Vector3(0, WHITE_MAILER_BOX.heightM * 0.6, 0),
    fingerCurl: 0.6,
    durationSeconds: 0.4,
  })
  yield* moveObject(
    {
      object: params.box.group,
      hand,
      parent: params.parent,
      localPosition: params.position,
      localQuaternion: params.quaternion,
      durationSeconds: 0.7,
      arcHeightM: 0.08,
    },
    ctx,
  )
  yield* releaseHand(hand)
}

/** Unload the slide's engraved boxes onto the bench beside the laser, as a carry bundle. */
function* unloadEngravedBoxes(
  ctx: SimContext,
): Generator<void, Group | null, number> {
  const state = getLaser(ctx)
  const engraved = state.loadedBoxes.filter((box) => isBoxEngraved(box))
  if (engraved.length === 0) return null
  const bench = ctx.world.tables.laser_bench
  const bundle = new Group()
  bundle.position.copy(LASER_BENCH_SPOTS.engravedBundle)
  bench.add(bundle)
  ctx.statusText = `Pulling the slide out: ${engraved.length} boxes with "Made in China" on the base`
  yield* slideTo({ laser: state, isOut: true })
  for (const [index, box] of engraved.entries()) {
    ctx.statusText = `Engraved box ${index + 1} of ${engraved.length} off the slide`
    yield* handBox(
      {
        box,
        parent: bundle,
        position: getBundlePosition(index),
        quaternion: IDENTITY_QUATERNION,
        useLeftHand: index % 2 === 1,
      },
      ctx,
    )
  }
  state.loadedBoxes = state.loadedBoxes.filter((box) => !engraved.includes(box))
  return bundle
}

/** Load the next blank boxes onto the slide, base up, push it in and start the run. */
function* loadAndStart(ctx: SimContext): SimTask {
  const state = getLaser(ctx)
  const { laser } = state
  const run = state.blankBoxes.splice(0, LASER_BOXES_PER_RUN)
  if (run.length === 0) {
    if (laser.slide.position.z > 0)
      yield* slideTo({ laser: state, isOut: false })
    return
  }
  if (laser.slide.position.z < OMNI_X.slideOutZM)
    yield* slideTo({ laser: state, isOut: true })
  for (const [index, box] of run.entries()) {
    ctx.statusText = `Blank box ${index + 1} of ${run.length} onto the slide, base up`
    const slot = laser.slots[index]
    yield* handBox(
      {
        box,
        parent: laser.slide,
        position: slot.position,
        quaternion: slot.quaternion,
        useLeftHand: index % 2 === 1,
      },
      ctx,
    )
  }
  state.loadedBoxes = run
  ctx.statusText = "Sliding the boxes in and starting the UV laser"
  yield* slideTo({ laser: state, isOut: false })
  state.isEngraving = true
  state.engravedSeconds = 0
  state.runSeconds = LASER_FRAMING_SECONDS + LASER_SECONDS_PER_BOX * run.length
  laser.statusLight.material.color.setHex(PRINTER_STATUS_COLORS.printing)
  playCue("label_printer", ctx)
}

/** Carry the bundle of engraved boxes to pack-out and stack each in its place. */
function* deliverToPackOut(
  params: { bundle: Group; boxes: WhiteMailerBox[] },
  ctx: SimContext,
): SimTask {
  const { bundle, boxes } = params
  const { world } = ctx
  const leftGrip = new Object3D()
  leftGrip.position.set(-BOX_PITCH_X_M, BOX_PITCH_Y_M * 0.5, 0)
  const rightGrip = new Object3D()
  rightGrip.position.set(BOX_PITCH_X_M, BOX_PITCH_Y_M * 0.5, 0)
  bundle.add(leftGrip, rightGrip)
  ctx.statusText = `Picking up ${boxes.length} engraved boxes`
  ctx.cameraHint = null
  yield* pickUpInFront({ item: bundle, leftGrip, rightGrip }, ctx)
  ctx.statusText = `Carrying ${boxes.length} engraved boxes to the ${TABLE_PLACEMENTS.pack_out_bench.label}`
  yield* walkToStation(STATIONS.packOut, ctx)
  const packBench = world.tables.pack_out_bench
  const unitIndexOf = (box: WhiteMailerBox) =>
    world.units.findIndex((unit) => unit.box === box)
  const firstIndex = Math.min(...boxes.map(unitIndexOf))
  const setDownAt = getPackOutBoxPosition(firstIndex).setY(
    PACK_OUT_BENCH_SPOTS.boxStacks[0].y,
  )
  yield* setDownFromCarry(
    { item: bundle, toParent: packBench, toPosition: setDownAt },
    ctx,
  )
  ctx.statusText = `Stacking ${boxes.length} engraved boxes at pack-out`
  packBench.updateMatrixWorld(true)
  for (const box of boxes) packBench.attach(box.group)
  bundle.removeFromParent()
  const starts = boxes.map((box) => box.group.position.clone())
  const ends = boxes.map((box) => getPackOutBoxPosition(unitIndexOf(box)))
  yield* tween({
    durationSeconds: 0.8,
    onProgress: (progress) => {
      for (const [index, box] of boxes.entries()) {
        box.group.position.lerpVectors(starts[index], ends[index], progress)
        box.group.quaternion.identity()
      }
    },
  })
}

/**
 * Everything at the laser in one go: unload a finished run, load and start
 * the next, then carry the engraved boxes to pack-out. With `waitForRun`, a
 * run still engraving is waited out first (the batch scenario needs its boxes).
 */
export function* runLaserJob(
  params: { waitForRun?: boolean },
  ctx: SimContext,
): SimTask {
  const state = getLaser(ctx)
  ctx.progress.isOperatorBusy = true
  yield* walkToStation(STATIONS.uvLaser, ctx)
  const laserGroup = state.laser.group
  ctx.cameraHint = {
    station: STATIONS.uvLaser,
    view: LASER_CLOSE_UP,
    getFocusPoint: () =>
      laserGroup.localToWorld(new Vector3(0, OMNI_X.bedYM + 0.1, 0.15)),
  }
  if (state.isEngraving && params.waitForRun) {
    while (state.isEngraving) {
      ctx.statusText = `Waiting for the UV laser: ${getLaserStatusText(state).replace("UV laser: ", "")}`
      yield* waitSeconds(0.5)
    }
  }
  if (state.isEngraving) {
    ctx.statusText = getLaserStatusText(state)
    ctx.cameraHint = null
    ctx.progress.isOperatorBusy = false
    return
  }
  const engraved = state.loadedBoxes.filter((box) => isBoxEngraved(box))
  const bundle = yield* unloadEngravedBoxes(ctx)
  yield* loadAndStart(ctx)
  yield* runInParallel([
    releaseHand(ctx.operator.leftHand),
    releaseHand(ctx.operator.rightHand),
  ])
  if (bundle) yield* deliverToPackOut({ bundle, boxes: engraved }, ctx)
  ctx.cameraHint = null
  ctx.progress.isOperatorBusy = false
  ctx.statusText = bundle
    ? `${engraved.length} engraved boxes added at pack-out`
    : getLaserStatusText(state)
}

/**
 * The batch scenario needs every job unit's box engraved and at pack-out
 * before packing: keep running the laser until they are.
 */
export function* ensureBoxesAtPackOut(ctx: SimContext): SimTask {
  const { world } = ctx
  if (!world.uvLaser) return
  const jobBoxes = world.units
    .slice(0, ctx.progress.unitCount)
    .map((unit) => unit.box)
  for (let attempt = 0; attempt < 10; attempt++) {
    const missing = jobBoxes.filter((box) => !isBoxAtPackOut(box, ctx))
    if (missing.length === 0) return
    yield* runLaserJob({ waitForRun: true }, ctx)
  }
}
