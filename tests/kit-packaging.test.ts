import { expect, test } from "bun:test"
import { getStationStandPose } from "lib/layout/get-station-stand-pose"
import { BATCH_SIZE, STATIONS } from "lib/layout/station-layout"
import { CARTON_LABEL } from "lib/models/carton-label"
import {
  BAG_SHIPPING_CARTON,
  createShippingCarton,
  SHIPPING_CARTON,
} from "lib/models/shipping-carton"
import { LASER_BOXES_PER_RUN } from "lib/models/uv-laser"
import { isBoxEngraved } from "lib/models/white-mailer-box"
import { ManufacturingSimulation } from "lib/simulation/manufacturing-simulation"
import { getUpcModules, KIT_UPC } from "lib/viewer/create-bag-label-textures"

function getUpcCheckDigit(first11: string): number {
  const digits = first11.split("").map(Number)
  const odd = digits.filter((_, index) => index % 2 === 0)
  const even = digits.filter((_, index) => index % 2 === 1)
  const sum =
    3 * odd.reduce((total, digit) => total + digit, 0) +
    even.reduce((total, digit) => total + digit, 0)
  return (10 - (sum % 10)) % 10
}

test("the kit UPC is a valid UPC-A and encodes to 95 modules", () => {
  expect(KIT_UPC).toHaveLength(12)
  expect(getUpcCheckDigit(KIT_UPC.slice(0, 11))).toBe(Number(KIT_UPC[11]))
  const modules = getUpcModules(KIT_UPC)
  expect(modules).toHaveLength(95)
  expect(modules.startsWith("101")).toBe(true)
  expect(modules.slice(45, 50)).toBe("01010")
  expect(modules.endsWith("101")).toBe(true)
})

test("the kit floor has the UV laser bench; boxes start engraved at pack-out, on the slide, or blank", () => {
  const { world, tableLayout } = new ManufacturingSimulation().ctx
  expect(tableLayout.laser_bench).toBeDefined()
  expect(world.tables.laser_bench.parent).toBe(world.root)
  const laser = world.uvLaser
  if (!laser) throw new Error("The kit line has a UV laser")
  const atPackOut = world.units.filter(
    (unit) =>
      unit.box.group.parent === world.tables.pack_out_bench &&
      isBoxEngraved(unit.box),
  )
  expect(atPackOut).toHaveLength(12)
  expect(laser.loadedBoxes).toHaveLength(LASER_BOXES_PER_RUN)
  expect(laser.loadedBoxes.every((box) => isBoxEngraved(box))).toBe(true)
  expect(laser.blankBoxes).toHaveLength(BATCH_SIZE - 12 - LASER_BOXES_PER_RUN)
  expect(laser.blankBoxes.some((box) => isBoxEngraved(box))).toBe(false)
  expect(world.thermalPrinter?.roll.length).toBeGreaterThanOrEqual(BATCH_SIZE)
})

test("the bare-unit line has no box laser or UPC printer", () => {
  const { world, tableLayout } = new ManufacturingSimulation({
    productLine: "bagged",
  }).ctx
  expect(tableLayout.laser_bench).toBeUndefined()
  expect(world.tables.laser_bench.parent).toBeNull()
  expect(world.uvLaser).toBeNull()
  expect(world.thermalPrinter).toBeNull()
})

test("the laser job unloads a run to pack-out and starts the next run", () => {
  const simulation = new ManufacturingSimulation()
  simulation.setMode("simulation")
  simulation.startScenario("engrave_boxes")
  simulation.runUntilIdle({ dtSeconds: 0.05, maxSeconds: 300 })
  const { world } = simulation.ctx
  const laser = world.uvLaser
  if (!laser) throw new Error("The kit line has a UV laser")
  const atPackOut = world.units.filter(
    (unit) =>
      unit.box.group.parent === world.tables.pack_out_bench &&
      isBoxEngraved(unit.box),
  )
  expect(atPackOut).toHaveLength(12 + LASER_BOXES_PER_RUN)
  expect(laser.loadedBoxes).toHaveLength(LASER_BOXES_PER_RUN)
  expect(laser.laser.slide.position.z).toBe(0)
  // The new run burns while the operator is away, then the boxes are done.
  simulation.finishEngravingNow()
  expect(laser.isEngraving).toBe(false)
  expect(laser.loadedBoxes.every((box) => isBoxEngraved(box))).toBe(true)
  expect(laser.laser.beam.visible).toBe(false)
})

test("in game mode, E at the laser circle runs the laser job", () => {
  const simulation = new ManufacturingSimulation()
  simulation.setMode("game")
  const pose = getStationStandPose(STATIONS.uvLaser, simulation.ctx.tableLayout)
  simulation.ctx.operator.position.set(pose.x, 0, pose.z)
  simulation.ctx.operator.ccwYawRadians = pose.ccwYawRadians
  const actions = simulation.getGameActions()
  expect(actions.benchAction?.label).toBe(
    "Take 4 engraved boxes to pack-out and start 4 more on the UV laser",
  )
})

test(
  "a full kit batch: every box engraved, a UPC sticker on the base, all shipped",
  () => {
    const simulation = new ManufacturingSimulation()
    simulation.startScenario("run_batch")
    simulation.runUntilIdle({ dtSeconds: 0.05, maxSeconds: 7000 })
    const { world, progress } = simulation.ctx
    expect(progress.isJobComplete).toBe(true)
    for (const unit of world.units) {
      expect(unit.stage).toBe("shipped")
      expect(isBoxEngraved(unit.box)).toBe(true)
      const upc = unit.upcLabel
      if (!upc) throw new Error("Every box gets a UPC sticker")
      expect(upc.parent).toBe(unit.box.group)
      expect(
        upc.position.distanceTo(unit.box.barcodeSpot.position),
      ).toBeLessThan(1e-6)
      // Printed side faces down, off the bottom of the box.
      expect(upc.position.y).toBeLessThan(0)
    }
    const laser = world.uvLaser
    expect(laser?.blankBoxes).toHaveLength(0)
    // Both carton labels on the sealed carton, the carrier label clear of the box ID.
    for (const label of [world.cartonLabel, world.carrierLabel]) {
      expect(label.group.visible).toBe(true)
      expect(label.group.parent).toBe(world.carton.group)
    }
    expect(
      world.carrierLabel.group.position.distanceTo(
        world.cartonLabel.group.position,
      ),
    ).toBeGreaterThan(CARTON_LABEL.widthM)
  },
  { timeout: 180_000 },
)

test("each carton has room for the box ID and the carrier label without overlap", () => {
  for (const spec of [SHIPPING_CARTON, BAG_SHIPPING_CARTON]) {
    const carton = createShippingCarton(spec)
    const boxId = carton.boxIdLabelSpot.position
    const carrier = carton.carrierLabelSpot.position
    const isSameFace = Math.sign(boxId.z) === Math.sign(carrier.z)
    if (isSameFace)
      expect(Math.abs(boxId.x - carrier.x)).toBeGreaterThan(CARTON_LABEL.widthM)
    // Both sit on a side face, below the top seam.
    for (const spot of [boxId, carrier])
      expect(spot.y + CARTON_LABEL.widthM / 2).toBeLessThan(spec.innerHeightM)
  }
  // The kit carton takes both on the front; the short bag carton puts the carrier label on the back.
  const kit = createShippingCarton(SHIPPING_CARTON)
  expect(kit.carrierLabelSpot.position.z).toBeGreaterThan(0)
  const bag = createShippingCarton(BAG_SHIPPING_CARTON)
  expect(bag.carrierLabelSpot.position.z).toBeLessThan(0)
})
