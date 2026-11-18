import type { StickerArtwork } from "lib/models/sticker"
import { CanvasTexture, SRGBColorSpace, type Texture } from "three"

const INK = "#111418"

/** Code 128-looking bars from a string, deterministic so every label matches. */
function drawBars(params: {
  context: CanvasRenderingContext2D
  value: string
  x: number
  y: number
  width: number
  height: number
}): void {
  const { context, value } = params
  const modules: number[] = []
  for (const character of `*${value}*`) {
    const code = character.charCodeAt(0)
    for (let bit = 0; bit < 6; bit++) modules.push(((code >> bit) & 1) + 1)
  }
  const total = modules.reduce((sum, width) => sum + width, 0)
  const unit = params.width / total
  let x = params.x
  for (const [index, width] of modules.entries()) {
    if (index % 2 === 0) {
      context.fillStyle = INK
      context.fillRect(x, params.y, width * unit, params.height)
    }
    x += width * unit
  }
}

/** A canvas whose long side runs down the label (sticker +Y on the plane), drawn as if the label were landscape. */
function createLandscapeCanvas(params: {
  shortPx: number
  longPx: number
  draw: (
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => void
}): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = params.shortPx
  canvas.height = params.longPx
  const context = canvas.getContext("2d")
  if (!context) return canvas
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  // Turn the drawing so it reads along the label's long side.
  context.translate(canvas.width, 0)
  context.rotate(Math.PI / 2)
  params.draw(context, params.longPx, params.shortPx)
  return canvas
}

/**
 * Yellow ESD caution sticker (2" x 1") that comes with the bags: the ESD
 * hand-in-triangle symbol and the standard caution wording.
 */
function drawEsdCautionLabel(): HTMLCanvasElement {
  return createLandscapeCanvas({
    shortPx: 200,
    longPx: 400,
    draw: (context, width, height) => {
      context.fillStyle = "#f5c518"
      context.fillRect(0, 0, width, height)
      context.strokeStyle = INK
      context.lineWidth = 6
      context.strokeRect(8, 8, width - 16, height - 16)
      // ESD symbol: a triangle with a hand crossed out by a bar.
      context.fillStyle = INK
      context.beginPath()
      context.moveTo(90, 34)
      context.lineTo(156, 160)
      context.lineTo(24, 160)
      context.closePath()
      context.fill()
      context.fillStyle = "#f5c518"
      context.beginPath()
      context.moveTo(90, 62)
      context.lineTo(136, 148)
      context.lineTo(44, 148)
      context.closePath()
      context.fill()
      context.fillStyle = INK
      context.fillRect(80, 92, 20, 46)
      context.fillRect(70, 108, 10, 24)
      context.lineWidth = 7
      context.beginPath()
      context.moveTo(52, 144)
      context.lineTo(130, 78)
      context.stroke()
      context.font = "800 40px 'IBM Plex Sans', sans-serif"
      context.fillText("CAUTION", 176, 74)
      context.font = "700 21px 'IBM Plex Sans', sans-serif"
      context.fillText("ELECTROSTATIC", 176, 110)
      context.fillText("SENSITIVE", 176, 136)
      context.fillText("DEVICES", 176, 162)
    },
  })
}

/** Amazon FNSKU label, 1" x 2-5/8", as Seller Central prints it. */
function drawFnskuLabel(): HTMLCanvasElement {
  return createLandscapeCanvas({
    shortPx: 200,
    longPx: 525,
    draw: (context, width) => {
      drawBars({
        context,
        value: "X00TSC17RP",
        x: 40,
        y: 18,
        width: width - 80,
        height: 96,
      })
      context.fillStyle = INK
      context.font = "600 26px 'IBM Plex Mono', monospace"
      context.fillText("X00TSC17RP", 150, 146)
      context.font = "500 20px 'IBM Plex Sans', sans-serif"
      context.fillText("NEMA17 Motor Controller Kit", 40, 176)
      context.fillText("New", width - 80, 176)
    },
  })
}

/** UPC-A left-hand (odd parity) digit patterns; the right-hand ones are their complements. */
const UPC_LEFT_PATTERNS = [
  "0001101",
  "0011001",
  "0010011",
  "0111101",
  "0100011",
  "0110001",
  "0101111",
  "0111011",
  "0110111",
  "0001011",
]

/** The tscircuit NEMA17 kit's GTIN-12, from tscircuit/product-packaging products/nema17/product.json. */
export const KIT_UPC = "884400898623"

/** The 95 UPC-A modules for 12 digits: guards, six left digits, centre guard, six right digits, guard. */
export function getUpcModules(digits: string): string {
  const left = digits
    .slice(0, 6)
    .split("")
    .map((digit) => UPC_LEFT_PATTERNS[Number(digit)])
    .join("")
  const right = digits
    .slice(6)
    .split("")
    .map((digit) =>
      UPC_LEFT_PATTERNS[Number(digit)]
        .split("")
        .map((bit) => (bit === "1" ? "0" : "1"))
        .join(""),
    )
    .join("")
  return `101${left}01010${right}101`
}

/**
 * The 2" x 1" thermal UPC sticker, black on white, as in the
 * product-packaging proof: UPC-A bars with the digits underneath.
 */
function drawUpcLabel(): HTMLCanvasElement {
  return createLandscapeCanvas({
    shortPx: 200,
    longPx: 400,
    draw: (context, width) => {
      const modules = getUpcModules(KIT_UPC)
      // 0.0104" modules on a 2" label at 200 px per inch.
      const moduleWidth = 2.08
      const left = (width - modules.length * moduleWidth) / 2
      const guardIndices = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94])
      // The first and last digits' bars run long, like the guards.
      for (let index = 3; index < 10; index++) guardIndices.add(index)
      for (let index = 85; index < 92; index++) guardIndices.add(index)
      context.fillStyle = INK
      for (const [index, bit] of modules.split("").entries()) {
        if (bit !== "1") continue
        const isLong = guardIndices.has(index)
        context.fillRect(
          left + index * moduleWidth,
          18,
          moduleWidth,
          isLong ? 158 : 144,
        )
      }
      context.font = "500 22px 'IBM Plex Mono', monospace"
      context.textAlign = "center"
      context.fillText(KIT_UPC[0], left - 14, 186)
      context.fillText(
        KIT_UPC.slice(1, 6).split("").join(" "),
        left + 26 * moduleWidth,
        186,
      )
      context.fillText(
        KIT_UPC.slice(6, 11).split("").join(" "),
        left + 69 * moduleWidth,
        186,
      )
      context.fillText(
        KIT_UPC[11],
        left + modules.length * moduleWidth + 14,
        186,
      )
    },
  })
}

/** "Made in China" as the UV laser burns it into the white board: a warm brown mark on clear. */
export function createOriginEngravingTexture(): Texture {
  const canvas = document.createElement("canvas")
  canvas.width = 512
  canvas.height = 92
  const context = canvas.getContext("2d")
  if (context) {
    context.fillStyle = "#5a4634"
    context.font = "600 64px 'IBM Plex Sans', sans-serif"
    context.textAlign = "center"
    context.textBaseline = "middle"
    context.fillText("Made in China", 256, 48)
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** Canvas textures for the line's printed stickers; the kit label uses the approved artwork image. */
export function createBagLabelTextures(): Record<
  Exclude<StickerArtwork, "kit_label">,
  Texture
> {
  const make = (canvas: HTMLCanvasElement) => {
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 4
    return texture
  }
  return {
    esd_caution: make(drawEsdCautionLabel()),
    fnsku: make(drawFnskuLabel()),
    upc: make(drawUpcLabel()),
  }
}
