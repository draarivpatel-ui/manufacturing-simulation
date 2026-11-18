import { CanvasTexture, SRGBColorSpace } from "three"

/** A prop for the animation with decorative bars and an explicit sample mark. */
export function createCartonLabelTexture(): CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = 400
  canvas.height = 600
  const context = canvas.getContext("2d")!
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = "#171717"
  context.font = "bold 42px sans-serif"
  context.fillText("FBA BOX ID", 34, 91)
  context.font = "23px sans-serif"
  context.fillText("NEMA17  ·  CARTON 01", 34, 132)
  context.fillRect(34, 158, 332, 3)

  const barWidths = [
    4, 3, 8, 3, 3, 6, 4, 3, 8, 4, 3, 4, 6, 3, 4, 8, 3, 6, 3, 3, 6, 4, 8, 3, 4,
    3, 8, 6, 3, 4, 6, 3, 4, 8, 4, 3, 3, 8,
  ]
  let x = 34
  for (const [index, width] of barWidths.entries()) {
    context.fillRect(x, 210, width, 155)
    x += width + (index % 3 === 0 ? 6 : 3)
  }

  context.font = "bold 32px sans-serif"
  context.fillText("SIMULATION", 34, 435)
  context.font = "22px sans-serif"
  context.fillText("SAMPLE LABEL", 34, 471)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/**
 * A 4" x 6" carrier shipping label as the carrier's system prints it: ship
 * from, ship to the Amazon fulfillment center from Send to Amazon, the FBA
 * shipment ID as the reference, piece count, weight and the tracking barcode.
 * A clearly marked sample: real labels come from the carrier.
 */
export function createCarrierLabelTexture(params: {
  weightLb: number
}): CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = 400
  canvas.height = 600
  const context = canvas.getContext("2d")!
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = "#171717"
  context.font = "bold 40px sans-serif"
  context.fillText("DHL", 28, 58)
  context.font = "bold 20px sans-serif"
  context.fillText("EXPRESS · SAMPLE", 120, 54)
  context.fillRect(28, 74, 344, 3)

  context.font = "bold 15px sans-serif"
  context.fillText("FROM", 28, 102)
  context.fillText("TO", 28, 172)
  context.font = "16px sans-serif"
  context.fillText("tscircuit lab", 80, 102)
  context.fillText("Unit 322", 80, 122)
  context.fillText("Amazon.com Services LLC", 80, 172)
  context.fillText("Fulfillment center from", 80, 192)
  context.fillText("Send to Amazon", 80, 212)
  context.fillRect(28, 232, 344, 2)

  context.font = "bold 16px sans-serif"
  context.fillText("Ref: FBA shipment ID", 28, 262)
  context.font = "16px sans-serif"
  context.fillText(`Piece 1 of 1   ·   ${params.weightLb} lb`, 28, 288)

  // Tracking barcode (decorative bars, not a real waybill).
  let x = 40
  for (let index = 0; index < 64; index++) {
    const width = 1 + ((index * 7 + 3) % 4)
    if (index % 2 === 0) context.fillRect(x, 314, width, 120)
    x += width + 1
  }
  context.font = "18px monospace"
  context.fillText("WAYBILL 00 0000 0000", 60, 462)
  context.fillRect(28, 486, 344, 2)
  context.font = "bold 26px sans-serif"
  context.fillText("SIMULATION", 28, 530)
  context.font = "18px sans-serif"
  context.fillText("SAMPLE LABEL", 28, 560)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}
