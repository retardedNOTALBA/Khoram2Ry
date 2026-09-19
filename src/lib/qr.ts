import jsQR from "jsqr";
import { AppError } from "./errors";

export async function readQrImage(file: File): Promise<string> {
  if (file.size > 12 * 1024 * 1024) throw new AppError("TOO_LARGE");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new AppError("QR_NOT_FOUND");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(frame.data, frame.width, frame.height);
    if (!result?.data) throw new AppError("QR_NOT_FOUND");
    return result.data;
  } finally { URL.revokeObjectURL(url); }
}