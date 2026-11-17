import { PRINTER_STATUS_COLORS } from "lib/models/bambu-printer"
import { WHITE_MAILER_BOX } from "lib/models/white-mailer-box"
import { createBoxMesh, createStandardMaterial } from "lib/scene/primitives"
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three"

/**
 * ComMarker Omni X UV laser (355 nm), fully enclosed, with the slide
 * extension: a tray that passes through the machine on rails, 250 x 400 mm of
 * work area on the 12 W model. About 515 x 320 x 655 mm. Origin on the table
 * under the centre of the machine; the door and the slide face +Z.
 */
export const OMNI_X = {
  widthM: 0.515,
  depthM: 0.32,
  heightM: 0.655,
  /** Top of the base, where the slide runs through. */
  bedYM: 0.06,
  slideWidthM: 0.25,
  slideLengthM: 0.4,
  /** How far forward the slide is pulled to load and unload. */
  slideOutZM: 0.28,
} as const

/** Mailer boxes per run: 3 across by 2 deep on the slide, back face up. */
export const LASER_BOX_COLUMNS = 3
export const LASER_BOX_ROWS = 2
export const LASER_BOXES_PER_RUN = LASER_BOX_COLUMNS * LASER_BOX_ROWS

/**
 * A mailer lying on its front with the back face up and its long side along
 * the slide (Z): turn the back (-Z) up, then the length onto Z.
 */
export const BOX_ON_SLIDE_QUATERNION = new Quaternion()
  .setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
  .multiply(
    new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2),
  )

const TRAY_THICKNESS_M = 0.008

export interface UvLaser {
  group: Group
  /** The slide tray; move `position.z` between 0 (in) and `slideOutZM` (out). */
  slide: Group
  /** Box origins on the slide, front row first. */
  slots: Object3D[]
  statusLight: Mesh<BoxGeometry, MeshBasicMaterial>
  /** The violet beam from the galvo head; scale Y is its length. */
  beam: Mesh
  /** The bright spot where the beam meets the box. */
  beamSpot: Mesh
  /** Bottom of the galvo head, where the beam starts, in machine coordinates. */
  headPoint: Vector3
}

export function createUvLaser(): UvLaser {
  const group = new Group()
  const { widthM, depthM, heightM, bedYM } = OMNI_X
  const shell = createStandardMaterial({ color: 0xe9ebee, roughness: 0.45 })
  const trim = createStandardMaterial({ color: 0x2a2d33, roughness: 0.6 })
  const windowTint = createStandardMaterial({
    color: 0xff8a1f,
    roughness: 0.2,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  })
  const wallM = 0.02
  const slotTopYM = bedYM + 0.16
  group.add(
    // Base, sides, back and roof.
    createBoxMesh({
      size: [widthM, bedYM, depthM],
      material: trim,
      position: [0, bedYM / 2, 0],
    }),
    createBoxMesh({
      size: [wallM, heightM - bedYM, depthM],
      material: shell,
      position: [-widthM / 2 + wallM / 2, (heightM + bedYM) / 2, 0],
    }),
    createBoxMesh({
      size: [wallM, heightM - bedYM, depthM],
      material: shell,
      position: [widthM / 2 - wallM / 2, (heightM + bedYM) / 2, 0],
    }),
    createBoxMesh({
      size: [widthM, heightM - slotTopYM, wallM],
      material: shell,
      position: [0, (heightM + slotTopYM) / 2, -depthM / 2 + wallM / 2],
    }),
    createBoxMesh({
      size: [widthM, 0.06, depthM],
      material: shell,
      position: [0, heightM - 0.03, 0],
    }),
    // Front: a frame round the orange UV-blocking window, the slide's pass-through below it.
    createBoxMesh({
      size: [widthM, 0.07, wallM],
      material: trim,
      position: [0, slotTopYM + 0.035, depthM / 2 - wallM / 2],
    }),
    createBoxMesh({
      size: [widthM - 0.06, heightM - slotTopYM - 0.16, 0.006],
      material: windowTint,
      position: [
        0,
        (heightM - 0.09 + slotTopYM + 0.07) / 2,
        depthM / 2 - wallM / 2,
      ],
    }),
    createBoxMesh({
      size: [widthM, 0.03, wallM],
      material: trim,
      position: [0, heightM - 0.075, depthM / 2 - wallM / 2],
    }),
  )
  // Jambs either side of the pass-through.
  for (const side of [-1, 1])
    group.add(
      createBoxMesh({
        size: [
          (widthM - OMNI_X.slideWidthM - 0.04) / 2,
          slotTopYM - bedYM,
          wallM,
        ],
        material: shell,
        position: [
          side * (widthM / 2 - (widthM - OMNI_X.slideWidthM - 0.04) / 4),
          (slotTopYM + bedYM) / 2,
          depthM / 2 - wallM / 2,
        ],
      }),
    )

  // Galvo head hanging from the roof.
  const headBottomYM = heightM - 0.2
  group.add(
    createBoxMesh({
      size: [0.12, 0.14, 0.12],
      material: trim,
      position: [0, headBottomYM + 0.07, 0],
    }),
  )
  const headPoint = new Vector3(0, headBottomYM, 0)
  const beam = new Mesh(
    new BoxGeometry(0.003, 1, 0.003),
    new MeshBasicMaterial({ color: 0xa070ff }),
  )
  beam.visible = false
  const beamSpot = new Mesh(
    new SphereGeometry(0.006, 12, 8),
    new MeshBasicMaterial({ color: 0xe6d4ff }),
  )
  beamSpot.visible = false
  group.add(beam, beamSpot)

  // Rails for the slide extension, through the machine and out the front.
  const railLengthM = depthM + OMNI_X.slideOutZM + 0.12
  for (const side of [-1, 1])
    group.add(
      createBoxMesh({
        size: [0.012, 0.012, railLengthM],
        material: trim,
        position: [
          side * (OMNI_X.slideWidthM / 2 + 0.01),
          bedYM + 0.006,
          (OMNI_X.slideOutZM + 0.12) / 2,
        ],
      }),
    )
  const slide = new Group()
  slide.position.y = bedYM + 0.012
  slide.add(
    createBoxMesh({
      size: [OMNI_X.slideWidthM, TRAY_THICKNESS_M, OMNI_X.slideLengthM],
      material: createStandardMaterial({ color: 0x3b4048, roughness: 0.7 }),
      position: [0, TRAY_THICKNESS_M / 2, 0],
    }),
  )
  // Box origin for each place: the box lies on its front, so it stands
  // `widthM` tall and reaches `heightM` along X from its origin.
  const box = WHITE_MAILER_BOX
  const slots: Object3D[] = []
  for (let row = 0; row < LASER_BOX_ROWS; row++)
    for (let column = 0; column < LASER_BOX_COLUMNS; column++) {
      const slot = new Object3D()
      const centerX = (column - (LASER_BOX_COLUMNS - 1) / 2) * 0.082
      const centerZ = ((LASER_BOX_ROWS - 1) / 2 - row) * 0.19
      slot.position.set(
        centerX - box.heightM / 2,
        TRAY_THICKNESS_M + box.widthM / 2,
        centerZ,
      )
      slot.quaternion.copy(BOX_ON_SLIDE_QUATERNION)
      slide.add(slot)
      slots.push(slot)
    }
  group.add(slide)

  const statusLight = new Mesh(
    new BoxGeometry(0.12, 0.012, 0.004),
    new MeshBasicMaterial({ color: PRINTER_STATUS_COLORS.ready }),
  )
  statusLight.position.set(0, heightM - 0.075, depthM / 2 + 0.001)
  group.add(statusLight)
  return { group, slide, slots, statusLight, beam, beamSpot, headPoint }
}

/** Where the engraving lands on a box in a slide slot: the middle of its back face, now on top. */
export function getEngravePointOnSlot(slot: Object3D): Vector3 {
  const box = WHITE_MAILER_BOX
  return slot.position
    .clone()
    .add(new Vector3(box.heightM / 2, box.widthM / 2, 0))
}
