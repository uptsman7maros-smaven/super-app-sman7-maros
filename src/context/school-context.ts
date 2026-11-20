import { createContext } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  AcademicYear,
  MasterIdentity,
  ModuleSetting,
  SchoolAccount,
  SchoolSettings,
} from "../services/masterDataService";

export type SchoolUser = SchoolAccount & MasterIdentity;

export type SchoolContextValue = {
  currentUser: SchoolUser | null;
  userRole: string | null;
  schoolSettings: SchoolSettings | null;
  activeAcademicYear: AcademicYear | null;
  moduleSettings: ModuleSetting[];
  contextLoading: boolean;
  contextError: string;
  setCurrentUser: Dispatch<SetStateAction<SchoolAccount | null>>;
  refreshSchoolContext: () => Promise<void>;
};

export const EMPTY_IDENTITY: MasterIdentity = {
  student_id: null,
  teacher_id: null,
  class_id: null,
  class_name: null,
  full_name: "",
  nip_or_nisn: "",
  jabatan: null,
  staff_category: null,
  primary_role: null,
  additional_roles: [],
};

export const SchoolContext = createContext<SchoolContextValue | null>(null);
