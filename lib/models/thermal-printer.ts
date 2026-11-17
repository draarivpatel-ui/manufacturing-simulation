import { createBoxMesh, createStandardMaterial } from "lib/scene/primitives"
import { METERS_PER_INCH } from "lib/units"
import { Group, Object3D } from "three"

/**
 * MUNBYN 4" thermal label printer loaded with a roll of 2" x 1" white direct
 * thermal labels. About 180 x 220 x 90 mm (W x D x H). Origin on the table;
 * labels come out of the slot at the front (+Z).
 */
export const THERMAL_PRINTER = {
  widthM: 0.18,
  depthM: 0.22,
  heightM: 0.09,
  slotYM: 0.052,
} as const

/** The UPC-A sticker on the thermal roll: 2" wide, 1" high. */
export const UPC_STICKER = {
  widthM: 1 * METERS_PER_INCH,
  lengthM: 2 * METERS_PER_INCH,
} as const

export interface ThermalPrinter {
  group: Group
  /** Inside the slot, where a label starts before it feeds out. */
  feedStart: Object3D
  /** Out of the slot, where the printed label waits to be peeled. */
  feedEnd: Object3D
}

export function createThermalPrinter(): ThermalPrinter {
  const group = new Group()
  const body = createStandardMaterial({ color: 0x2b2e33, roughness: 0.55 })
  const lid = createStandardMaterial({ color: 0x3d4148, roughness: 0.4 })
  const { widthM, depthM, heightM, slotYM } = THERMAL_PRINTER
  const slotM = 0.004
  group.add(
    createBoxMesh({
      size: [widthM, slotYM, depthM],
      material: body,
      position: [0, slotYM / 2, 0],
    }),
    createBoxMesh({
      size: [widthM, heightM - slotYM - slotM, depthM],
      material: lid,
      position: [0, (heightM + slotYM + slotM) / 2, 0],
    }),
    createBoxMesh({
      size: [widthM - 0.06, slotM, depthM - 0.02],
      material: createStandardMaterial({ color: 0x141518 }),
      position: [0, slotYM + slotM / 2, -0.01],
    }),
    // Feed button on the lid.
    createBoxMesh({
      size: [0.02, 0.004, 0.012],
      material: createStandardMaterial({ color: 0x4aa3ff, roughness: 0.4 }),
      position: [widthM / 2 - 0.03, heightM + 0.002, depthM / 2 - 0.03],
    }),
  )
  // Label printed face up, the 2" side across the printer.
  const feedStart = new Object3D()
  feedStart.position.set(0, slotYM + 0.001, depthM / 2 - UPC_STICKER.widthM / 2)
  feedStart.rotation.y = Math.PI / 2
  const feedEnd = new Object3D()
  feedEnd.position.set(0, slotYM + 0.001, depthM / 2 + UPC_STICKER.widthM / 2)
  feedEnd.rotation.y = Math.PI / 2
  group.add(feedStart, feedEnd)
  return { group, feedStart, feedEnd }
}
