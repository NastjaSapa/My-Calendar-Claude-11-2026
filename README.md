# Dopamine Calendar

A colorful face for Google Calendar and Google Tasks. It's a web app you can install on Android.

- **Day and Week views** of your own and your shared Google calendars
- **New events by typing the time**: "fri 7-10pm", "9-10", "tomorrow 14:00", "21.11 18-20", "all day sat"
- **Top 3** priorities for the week (at most three at a time)
- **Getting urgent**: deadlines whose dot grows as the due date gets closer
- **Week notes**: to-dos for the week that don't belong to a particular day
- **Three moods**: Work (Mon–Thu 9–16), Weekend (all other times), and Migraine (soft pastels, switched on by hand)

All data stays in Google. Events go to Google Calendar, and the Top 3, deadlines and week notes go to three Google Tasks lists that the app creates ("Dopamine · …").

Try it without signing in: add `?demo` to the address.

## Settings
`config.js` holds the Google Client ID, the work hours and the names of the Tasks lists.

## Hosting
GitHub Pages serves the static files as they are. There's no build step.
The site's address must be listed under **Authorized JavaScript origins** in the Google OAuth client: `https://nastjasapa.github.io`.
