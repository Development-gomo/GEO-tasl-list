# GEO Service

Production React app for GEO delivery planning. The app uses:

- React with Vite
- React Router
- Tailwind CSS
- Firebase Authentication
- Cloud Firestore
- Firebase Admin SDK only for the optional seed script

Supabase has been removed. Old static prototype files are kept locally in `legacy/`, which is ignored by Git.

## Firebase Setup

Enable these Firebase services:

- Authentication
- Email/password sign-in provider
- Cloud Firestore

Create the first admin manually:

1. Create a Firebase Auth email/password user in the Firebase console.
2. Create `users/{uid}` in Firestore with:

```json
{
  "uid": "the-auth-user-id",
  "name": "Admin Name",
  "email": "admin@example.com",
  "role": "admin",
  "status": "active"
}
```

Admins can create additional users from the app. The app uses a secondary Firebase client app to create Firebase Auth accounts without logging out the current admin. Passwords are created in Firebase Auth and are never stored in Firestore.

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in the Firebase web app values:

```bash
cp .env.local.example .env.local
```

Because this is a Vite React app, Firebase browser variables must use the `VITE_FIREBASE_*` prefix.

For the optional `npm run seed:admin` bootstrap command, also add a Firebase service account:

```txt
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
```

If your private key contains newline escapes, keep them as `\n`; the app converts them at runtime.

## Firestore Data Model

```txt
users/{userId}
projects/{projectId}
projects/{projectId}/teamMembers/{memberId}
projects/{projectId}/plans/{planType}
projects/{projectId}/plans/{planType}/phases/{phaseId}
projects/{projectId}/plans/{planType}/phases/{phaseId}/tasks/{taskId}
projects/{projectId}/importExportMetadata/{metadataId}
```

Task data, owners, notes, links, progress, and import/export metadata are stored as structured Firestore documents, not one large app-state blob.

## Security Rules

Deploy `firestore.rules` to require:

- signed-in Firebase Auth users
- active Firestore user profile
- admin role for user management writes

With the Firebase CLI:

```bash
firebase deploy --only firestore:rules
```

The app must be able to read `users/{currentUserId}` after Firebase Auth login so it can validate profile status. If rules are not deployed, login can succeed in Firebase Auth but fail at the app profile check.

## Local Development

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```
