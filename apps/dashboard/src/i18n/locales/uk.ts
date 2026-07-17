interface Messages {
  common: { logout: string };
  login: {
    subtitle: string;
    loginLabel: string;
    passwordLabel: string;
    submit: string;
    invalidCredentials: string;
    adminOnly: string;
    genericError: string;
    showPassword: string;
    hidePassword: string;
  };
  nav: {
    overview: string;
    stock: string;
    intake: string;
    intakeShort: string;
    users: string;
    usersShort: string;
  };
  overview: { title: string };
  stock: { title: string };
  intake: { title: string };
  users: { title: string };
}

export const uk: Messages = {
  common: {
    logout: 'Вийти з акаунта',
  },
  login: {
    subtitle: 'Панель адміністратора',
    loginLabel: 'ЛОГІН',
    passwordLabel: 'ПАРОЛЬ',
    submit: 'Увійти',
    invalidCredentials: 'Невірний логін або пароль',
    adminOnly: 'Дашборд доступний лише адміністратору',
    genericError: 'Не вдалося увійти. Спробуйте ще раз.',
    showPassword: 'Показати пароль',
    hidePassword: 'Сховати пароль',
  },
  nav: {
    overview: 'Огляд',
    stock: 'Склад',
    intake: 'Поступлення',
    intakeShort: 'Черга',
    users: 'Користувачі',
    usersShort: 'Люди',
  },
  overview: {
    title: 'Огляд',
  },
  stock: {
    title: 'Склад',
  },
  intake: {
    title: 'Поступлення',
  },
  users: {
    title: 'Користувачі',
  },
};
