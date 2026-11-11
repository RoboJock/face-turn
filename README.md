# Face Turn

A 3×3 Rubik’s Cube you can scramble and solve in the browser, with beginner lessons, hints, an optional timer, color choices, and a leaderboard.

Accounts and saved solves use Firebase Authentication and Cloud Firestore. GitHub is a sign-in provider through Firebase.

## Run it

```bash
npm install
npm test
npm run dev
```

Without Firebase environment variables the cube still runs. Guest solves and the leaderboard stay in this browser, and GitHub sign-in stays off.

## Connect Firebase and GitHub

1. Create a Firebase project and a web app.
2. Copy `.env.example` to `.env.local` and fill in the web app config. Those values are the public client config, not a service account.
3. In Authentication, enable Anonymous, Email/Password, and GitHub.
4. In GitHub, create an OAuth app. Set the callback URL to `https://YOUR_PROJECT.firebaseapp.com/__/auth/handler` and paste the client id and secret into the Firebase GitHub provider.
5. Add this site’s domain to Authentication authorized domains.
6. Deploy the rules in `firestore.rules`: `npx firebase-tools deploy --only firestore:rules`.
7. Build with the env vars set, then deploy hosting from the `out` folder if you host on Firebase: `npx firebase-tools deploy --only hosting`.

GitHub Actions runs `npm test` and `npm run build` on every push.
