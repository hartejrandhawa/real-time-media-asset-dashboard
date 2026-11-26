import { createContext, useContext } from "react";

export const ToastContext = createContext(() => {});

// toast("Uploaded clip.mp4") or toast("Couldn't delete", "error")
export function useToast() {
  return useContext(ToastContext);
}
