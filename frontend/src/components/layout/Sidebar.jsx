import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, CreditCard, ArrowLeftRight,
  ClipboardList, User, Users, DollarSign,
  BarChart2, ShieldAlert, LogOut, CalendarClock,
} from 'lucide-react';
import AfinaLogo from '../ui/AfinaLogo';

const NAV = {
  Customer: [
    { to: '/dashboard',    icon: <LayoutDashboard size={15}/>, label: 'Главная'    },
    { to: '/accounts',     icon: <CreditCard size={15}/>,      label: 'Счета'      },
    { to: '/transactions', icon: <ClipboardList size={15}/>,   label: 'Транзакции' },
    { to: '/transfer',     icon: <ArrowLeftRight size={15}/>,  label: 'Переводы'   },
    { to: '/profile',      icon: <User size={15}/>,            label: 'Профиль'    },
  ],
  Cashier: [
    { to: '/cashier',         icon: <LayoutDashboard size={15}/>, label: 'Панель кассира' },
    { to: '/cashier/clients', icon: <Users size={15}/>,           label: 'Клиенты'        },
    { to: '/cashier/ops',     icon: <DollarSign size={15}/>,      label: 'Операции'       },
    { to: '/cashier/reports', icon: <BarChart2 size={15}/>,       label: 'Отчёты'         },
    { to: '/cashier/fraud',   icon: <ShieldAlert size={15}/>,     label: 'Антифрод'       },
  ],
  Admin: [
    { to: '/admin',           icon: <LayoutDashboard size={15}/>, label: 'Дашборд'       },
    { to: '/admin/users',     icon: <Users size={15}/>,           label: 'Пользователи'  },
    { to: '/admin/audit',     icon: <ClipboardList size={15}/>,   label: 'Журнал аудита' },
    { to: '/admin/analytics', icon: <BarChart2 size={15}/>,       label: 'Аналитика'     },
    { to: '/admin/fraud',     icon: <ShieldAlert size={15}/>,     label: 'Антифрод'      },
  ],
  LegalEntity: [
    { to: '/dashboard',       icon: <LayoutDashboard size={15}/>, label: 'Главная'      },
    { to: '/accounts',        icon: <CreditCard size={15}/>,      label: 'Счета'        },
    { to: '/legal/employees', icon: <Users size={15}/>,            label: 'Сотрудники'   },
    { to: '/legal/salary-autopay', icon: <CalendarClock size={15}/>, label: 'Автоплатежи' },
    { to: '/transfer',        icon: <ArrowLeftRight size={15}/>,   label: 'Выплаты'      },
    { to: '/transactions',    icon: <ClipboardList size={15}/>,   label: 'Транзакции'   },
    { to: '/profile',         icon: <User size={15}/>,             label: 'Профиль'      },
  ],
};

const ROLE_LABELS = {
  Customer: 'Личный кабинет',
  LegalEntity: 'Кабинет организации',
  Cashier:  'Касса',
  Admin:    'Администрация',
};

const ROLE_DISPLAY = {
  Customer: 'Клиент',
  LegalEntity: 'Юрлицо / ИП',
  Cashier:  'Кассир',
  Admin:    'Администратор',
};

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = NAV[user?.role] || [];

  const handleLogout = () => { logout(); navigate('/login'); };
  const handleNav = () => { if (onClose) onClose(); };

  return (
    <aside className={`sidebar${open ? ' sidebar--open' : ''}`}>
      <div className="sidebar__logo">
        <AfinaLogo size={36} showText textStyle="stacked" useThemeColor />
      </div>

      <div className="sidebar__role">{ROLE_LABELS[user?.role]}</div>

      <nav className="sidebar__nav">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to.split('/').length <= 2}
            className={({ isActive }) => `sidebar__link${isActive ? ' active' : ''}`}
            onClick={handleNav}
          >
            {l.icon}
            {l.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__bottom">
        <div className="sidebar__user">
          <div className="sidebar__user-avatar">{user?.avatar}</div>
          <div>
            <div className="sidebar__user-name">{user?.firstName || user?.fullName?.split(' ')[0] || 'Пользователь'}</div>
            <div className="sidebar__user-email">{ROLE_DISPLAY[user?.role] || user?.role}</div>
          </div>
        </div>
        <button className="sidebar__logout" onClick={handleLogout}>
          <LogOut size={14} /> Выйти из системы
        </button>
      </div>
    </aside>
  );
}
