import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Hàm gộp class mà các component shadcn / React Bits mong đợi ở "@/lib/utils"
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
