import { useContext } from "react";
import { SchoolContext } from "./school-context";

export function useSchoolContext() {
  const context = useContext(SchoolContext);
  if (!context) {
    throw new Error("useSchoolContext harus digunakan di dalam SchoolProvider.");
  }
  return context;
}
