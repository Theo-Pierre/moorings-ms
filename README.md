# moorings.ms

Fleet operations planning and decision engine with Firebase Authentication and role-based access control.

## Auth Model

- Authentication provider: **Firebase Auth** (email/password)
- Roles: `viewer`, `admin`, `super-admin`
- Default role for new users: **viewer**
- Role storage:
  - Primary: custom claims on Firebase Auth user
  - Optional mirror: Firestore collection `user_roles`

## Role Promotion

Promote or demote users by email from terminal:

```bash
npm run set-role -- --email user@company.com --role admin
```

Allowed roles:

- `viewer`
- `admin`
- `super-admin`

## Firebase Setup

1. In Firebase Console, enable **Authentication > Sign-in method > Email/Password**.
2. (Optional) Enable Firestore if you want role records mirrored in `user_roles`.
3. Set these environment variables for runtime/build:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
FIREBASE_PROJECT_ID=...
```

Optional for local/service-account auth:

```bash
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## Local Development

```bash
npm install
npm run dev
```

## Deploy (Firebase App Hosting)

```bash
npm run deploy
```
