import type { uk } from './uk';

export const en: typeof uk = {
  common: {
    logout: 'Log out',
  },
  login: {
    subtitle: 'Admin panel',
    loginLabel: 'LOGIN',
    passwordLabel: 'PASSWORD',
    submit: 'Log in',
    invalidCredentials: 'Invalid login or password',
    adminOnly: 'The dashboard is available to the administrator only',
    genericError: 'Could not log in. Please try again.',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
  },
  nav: {
    overview: 'Overview',
    stock: 'Stock',
    intake: 'Intake',
    intakeShort: 'Queue',
    users: 'Users',
    usersShort: 'People',
  },
  overview: {
    title: 'Overview',
  },
  stock: {
    title: 'Stock',
  },
  intake: {
    title: 'Intake',
  },
  users: {
    title: 'Users',
  },
};
