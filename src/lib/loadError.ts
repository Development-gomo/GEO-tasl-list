import { FirebaseError } from "firebase/app";

export function formatLoadError(area: string, error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === "permission-denied") {
      return `${area} could not load: Firestore permission denied.`;
    }
    if (error.code === "unavailable") {
      return `${area} could not load: Firestore is unavailable.`;
    }
    return `${area} could not load: ${error.message}`;
  }

  if (error instanceof Error) {
    return `${area} could not load: ${error.message}`;
  }

  return `${area} could not load.`;
}
