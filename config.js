// Public settings. The Client ID is not a secret: Google only accepts it
// from the web addresses listed in the Google Cloud Console.
window.DC_CONFIG = {
  clientId: '669005429138-0aki2bvfs5gumu65gesluah0n5npe3e7.apps.googleusercontent.com',
  scopes: [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/tasks'
  ].join(' '),
  // Asked for only when someone turns on the migraine log. It lets the app
  // create its own private "My tracking" calendar – and nothing else.
  healthScope: 'https://www.googleapis.com/auth/calendar.app.created',
  healthCalendarName: 'My tracking',
  // Work mode: Monday–Thursday, 9:00–16:00. Everything else: weekend look.
  workDays: [1, 2, 3, 4],
  workStartHour: 9,
  workEndHour: 16,
  // Names of the Google Tasks lists the app creates for you
  lists: {
    top3: 'Dopamine · Top 3',
    deadlines: 'Dopamine · Deadlines',
    notes: 'Dopamine · Week notes'
  },
  // Shown on the consent screen ("Questions?") and in privacy.html – put YOUR address here
  contactEmail: '[YOUR CONTACT EMAIL]',
  // Text for "Tell my person" (opens the phone's share sheet)
  shareText: 'Migraine right now – I\'ll get back to you in about 2 hours.'
};
