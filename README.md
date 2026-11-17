# Dopamine Calendar

A colorful face for Google Calendar and Google Tasks. It's a web app you can install on Android.

- **Day and Week views** of your own and your shared Google calendars
- **New events by typing the time**: "fri 7-10pm", "9-10", "tomorrow 14:00", "21.11 18-20", "all day sat"
- **Top 3** priorities for the week (at most three at a time)
- **Getting urgent**: deadlines whose dot grows as the due date gets closer
- **Week notes**: to-dos for the week that don't belong to a particular day
- **Day, Week and Month views**: the month view works in every mode and shows migraine days once the log is on
- **Two moods**: Work (Mon–Thu 9–16) and Weekend (all other times), picked automatically or by hand
- **Migraine mode ("dark pastel")**: dark screen, dimmed colors, no animation, two brightness levels (Dim / Darker)
  - **Just one thing**: during a migraine the day view shows only your #1 priority; the rest of today can be moved to tomorrow with one tap
  - **Symptom tracker**: big tiles for warning signs, aura, headache and recovery, optional aura type (seeing / feeling / speaking), one-tap medication log, "Tell my person" via the phone's share sheet
  - **Shortcuts**: long-press the app icon → "Migraine now" (opens straight into the dark mode), or press and hold the date in the app. Every start can be undone.
- **Private migraine log (optional)**: only after explicit consent. Saved in a private calendar called "My tracking" in your own Google account; symptoms sit in hidden fields, not in the title. Can be turned off or deleted completely in Settings. See `privacy.html`.

All data stays in Google. Events go to Google Calendar, and the Top 3, deadlines and week notes go to three Google Tasks lists that the app creates ("Dopamine · …").

Try it without signing in: add `?demo` to the address. `?demo&migraine` opens the demo straight in migraine mode.

## Settings
`config.js` holds the Google Client ID, the work hours, the names of the Tasks lists, the name of the private tracking calendar, your contact email (shown on the consent screen) and the "Tell my person" text.

Before inviting testers: put your name, address and email into `privacy.html` and your email into `config.js`.

## Google Cloud
The migraine log needs one extra scope, asked for only when someone turns the log on: `https://www.googleapis.com/auth/calendar.app.created`. Add it under **Google Auth Platform → Data access** in your Google Cloud project. It only lets the app manage calendars it created itself.

## Hosting
GitHub Pages serves the static files as they are. There's no build step.
The site's address must be listed under **Authorized JavaScript origins** in the Google OAuth client: `https://nastjasapa.github.io`.
