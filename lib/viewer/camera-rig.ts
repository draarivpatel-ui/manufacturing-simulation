import { FLOOR_PLAN } from "lib/layout/floor-plan"
import { type PerspectiveCamera, Vector3 } from "three"

export type CameraMode = "overview" | "follow" | "close_up"

const MIN_DISTANCE_M = 0.14
const MAX_DISTANCE_M = 34
const MIN_PITCH_RADIANS = 0.03
const MAX_PITCH_RADIANS = 1.52
/**
 * Stiffness (natural frequency, rad/s) of the critically damped springs that
 * move the camera: each move starts from rest, speeds up, then settles with
 * no overshoot. Higher is snappier. Following the operator stays tighter.
 */
const SPRING_RATE = 3.4
const FOLLOW_SPRING_RATE = 6
/** Longer frames are split so the springs stay stable. */
const MAX_SPRING_STEP_SECONDS = 1 / 30
/**
 * On a long move (bench to bench) the camera pulls back by this much per
 * metre still to travel, up to `MAX_PULL_BACK_M`, then settles in again.
 */
const PULL_BACK_PER_M = 0.45
const MAX_PULL_BACK_M = 3

/** Wrap an angle difference into -pi..pi so the camera turns the short way round. */
function wrapAngle(radians: number): number {
  return Math.atan2(Math.sin(radians), Math.cos(radians))
}

/** One step of a critically damped spring toward `offset` away; returns the new velocity. */
function springVelocity(params: {
  offset: number
  velocity: number
  rate: number
  dtSeconds: number
}): number {
  const { offset, velocity, rate, dtSeconds } = params
  return velocity + (rate * rate * offset - 2 * rate * velocity) * dtSeconds
}

const ROOM_CENTER = new Vector3(
  FLOOR_PLAN.widthM / 2,
  0.4,
  FLOOR_PLAN.eastLengthM / 2,
)

/**
 * Orbit camera with three framings: the whole floor, following the operator,
 * and a close-up on the work. The camera sits at `ccwYawRadians` around the
 * target, so it looks along -(sin yaw, cos yaw).
 */
export class CameraRig {
  mode: CameraMode = "follow"
  ccwYawRadians = -1.15
  pitchRadians = 0.5
  distanceM = 6
  readonly target = new Vector3(FLOOR_PLAN.widthM / 2, 1, 3)
  readonly panOffset = new Vector3()
  readonly modeDistancesM: Record<CameraMode, number> = {
    overview: 19,
    follow: 5.2,
    close_up: 0.9,
  }
  /** What the close-up looks at when no task is focusing it. */
  closeUpFocus: (() => Vector3) | null = null
  /** Where the view is turning to; null once it's there or the user takes over. */
  private yawGoal: number | null = null
  private pitchGoal: number | null = null
  private readonly targetVelocity = new Vector3()
  private distanceVelocity = 0
  private yawVelocity = 0
  private pitchVelocity = 0

  constructor(private readonly camera: PerspectiveCamera) {}

  setMode(params: { mode: CameraMode; isLandscape: boolean }): void {
    this.mode = params.mode
    this.panOffset.set(0, 0, 0)
    if (params.mode === "overview")
      this.aimAt({
        ccwYawRadians: params.isLandscape ? Math.PI / 2 : 0,
        pitchRadians: 0.95,
      })
  }

  /** Turn smoothly to look from this direction, rather than cutting to it. */
  aimAt(params: { ccwYawRadians: number; pitchRadians: number }): void {
    this.yawGoal = params.ccwYawRadians
    this.pitchGoal = params.pitchRadians
  }

  orbit(params: { dxPx: number; dyPx: number }): void {
    // The user is steering now: drop any turn still in progress.
    this.yawGoal = null
    this.pitchGoal = null
    this.yawVelocity = 0
    this.pitchVelocity = 0
    this.ccwYawRadians -= params.dxPx * 0.006
    this.pitchRadians = Math.min(
      MAX_PITCH_RADIANS,
      Math.max(MIN_PITCH_RADIANS, this.pitchRadians + params.dyPx * 0.005),
    )
  }

  pan(params: { dxPx: number; dyPx: number }): void {
    const metersPerPx = this.distanceM * 0.0016
    this.panOffset.x -= Math.cos(this.ccwYawRadians) * params.dxPx * metersPerPx
    this.panOffset.z += Math.sin(this.ccwYawRadians) * params.dxPx * metersPerPx
    this.panOffset.y += params.dyPx * metersPerPx
  }

  zoom(factor: number): void {
    const next = this.modeDistancesM[this.mode] * factor
    this.modeDistancesM[this.mode] = Math.min(
      MAX_DISTANCE_M,
      Math.max(MIN_DISTANCE_M, next),
    )
  }

  update(params: {
    dtSeconds: number
    operatorPosition: Vector3
    fallbackCloseUpTarget: Vector3
  }): void {
    let goal: Vector3
    if (this.mode === "overview") goal = ROOM_CENTER.clone()
    else if (this.mode === "follow")
      goal = new Vector3(
        params.operatorPosition.x,
        1.05,
        params.operatorPosition.z,
      )
    else
      goal = this.closeUpFocus
        ? this.closeUpFocus()
        : params.fallbackCloseUpTarget.clone()
    goal.add(this.panOffset)
    const rate = this.mode === "follow" ? FOLLOW_SPRING_RATE : SPRING_RATE
    const stepCount = Math.max(
      1,
      Math.ceil(params.dtSeconds / MAX_SPRING_STEP_SECONDS),
    )
    const dtSeconds = params.dtSeconds / stepCount
    for (let step = 0; step < stepCount; step++)
      this.stepSprings({ goal, rate, dtSeconds })
    const horizontalM = this.distanceM * Math.cos(this.pitchRadians)
    this.camera.position.set(
      this.target.x + horizontalM * Math.sin(this.ccwYawRadians),
      this.target.y + this.distanceM * Math.sin(this.pitchRadians),
      this.target.z + horizontalM * Math.cos(this.ccwYawRadians),
    )
    this.camera.lookAt(this.target)
  }

  /** Move the target, distance and angles one small step toward their goals. */
  private stepSprings(params: {
    goal: Vector3
    rate: number
    dtSeconds: number
  }): void {
    const { goal, rate, dtSeconds } = params
    // Pull back while there's a long way to go, so a bench-to-bench move
    // rises out and settles back in rather than skimming the tables.
    const travelM = this.target.distanceTo(goal)
    for (const axis of ["x", "y", "z"] as const) {
      this.targetVelocity[axis] = springVelocity({
        offset: goal[axis] - this.target[axis],
        velocity: this.targetVelocity[axis],
        rate,
        dtSeconds,
      })
      this.target[axis] += this.targetVelocity[axis] * dtSeconds
    }
    const distanceGoalM =
      this.modeDistancesM[this.mode] +
      Math.min(MAX_PULL_BACK_M, travelM * PULL_BACK_PER_M)
    this.distanceVelocity = springVelocity({
      offset: distanceGoalM - this.distanceM,
      velocity: this.distanceVelocity,
      rate,
      dtSeconds,
    })
    this.distanceM += this.distanceVelocity * dtSeconds
    if (this.yawGoal !== null) {
      const turn = wrapAngle(this.yawGoal - this.ccwYawRadians)
      this.yawVelocity = springVelocity({
        offset: turn,
        velocity: this.yawVelocity,
        rate: SPRING_RATE,
        dtSeconds,
      })
      this.ccwYawRadians += this.yawVelocity * dtSeconds
      if (Math.abs(turn) < 0.0005 && Math.abs(this.yawVelocity) < 0.001) {
        this.yawGoal = null
        this.yawVelocity = 0
      }
    }
    if (this.pitchGoal !== null) {
      const tilt = this.pitchGoal - this.pitchRadians
      this.pitchVelocity = springVelocity({
        offset: tilt,
        velocity: this.pitchVelocity,
        rate: SPRING_RATE,
        dtSeconds,
      })
      this.pitchRadians += this.pitchVelocity * dtSeconds
      if (Math.abs(tilt) < 0.0005 && Math.abs(this.pitchVelocity) < 0.001) {
        this.pitchGoal = null
        this.pitchVelocity = 0
      }
    }
  }
}
