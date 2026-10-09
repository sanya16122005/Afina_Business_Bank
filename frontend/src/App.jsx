import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import ThemeToggle from './components/ui/ThemeToggle';
import './styles/main.scss';

// Публичные
const LandingPage   = lazy(() => import('./pages/public/LandingPage'));
const LoginPage     = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage  = lazy(() => import('./pages/auth/RegisterPage'));
const RegisterLegalPage = lazy(() => import('./pages/auth/RegisterLegalPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));

// Клиент
const DashboardPage     = lazy(() => import('./pages/customer/DashboardPage'));
const AccountsPage      = lazy(() => import('./pages/customer/AccountsPage'));
const AccountDetailPage = lazy(() => import('./pages/customer/AccountDetailPage'));
const TransactionsPage  = lazy(() => import('./pages/customer/TransactionsPage'));
const TransferPage      = lazy(() => import('./pages/customer/TransferPage'));
const ProfilePage       = lazy(() => import('./pages/customer/ProfilePage'));
const LegalEmployeesPage = lazy(() => import('./pages/legal/LegalEmployeesPage'));
const SalaryAutopayPage = lazy(() => import('./pages/legal/SalaryAutopayPage'));

// Кассир
const CashierDashboard   = lazy(() => import('./pages/cashier/CashierDashboard'));
const ClientsPage        = lazy(() => import('./pages/cashier/ClientsPage'));
const ClientDetailPage   = lazy(() => import('./pages/cashier/ClientDetailPage'));
const OperationsPage     = lazy(() => import('./pages/cashier/OperationsPage'));
const ReportsPage        = lazy(() => import('./pages/cashier/ReportsPage'));
const CashierFraudPage   = lazy(() => import('./pages/cashier/FraudPage'));

// Админ
const AdminDashboard   = lazy(() => import('./pages/admin/AdminDashboard'));
const UsersPage        = lazy(() => import('./pages/admin/UsersPage'));
const AuditPage        = lazy(() => import('./pages/admin/AuditPage'));
const AnalyticsPage    = lazy(() => import('./pages/admin/AnalyticsPage'));
const AdminFraudPage   = lazy(() => import('./pages/admin/FraudPage'));

// Shared guard for protected areas: anonymous users and wrong roles both go back to login.
function PrivateRoute({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />;
  return children;
}

function RouteFallback() {
  return (
    <div className="route-fallback">
      <div className="route-fallback__spinner" />
    </div>
  );
}

const ROUTES = [
  // Публичные
  { path: '/',         element: <LandingPage />,  roles: null },
  { path: '/login',    element: <LoginPage />,    roles: null },
  { path: '/register', element: <RegisterPage />, roles: null },
  { path: '/register-legal', element: <RegisterLegalPage />, roles: null },
  { path: '/forgot-password', element: <ForgotPasswordPage />, roles: null },

  // Клиент и организация (юрлицо / ИП)
  { path: '/dashboard',     element: <DashboardPage />,     roles: ['Customer', 'LegalEntity'] },
  { path: '/accounts',      element: <AccountsPage />,      roles: ['Customer', 'LegalEntity'] },
  { path: '/accounts/:id',  element: <AccountDetailPage />, roles: ['Customer', 'LegalEntity'] },
  { path: '/transactions',  element: <TransactionsPage />,  roles: ['Customer', 'LegalEntity'] },
  { path: '/transfer',      element: <TransferPage />,      roles: ['Customer', 'LegalEntity'] },
  { path: '/profile',       element: <ProfilePage />,       roles: ['Customer', 'LegalEntity'] },
  { path: '/legal/employees', element: <LegalEmployeesPage />, roles: ['LegalEntity'] },
  { path: '/legal/salary-autopay', element: <SalaryAutopayPage />, roles: ['LegalEntity'] },

  // Кассир
  { path: '/cashier',              element: <CashierDashboard />, roles: ['Cashier'] },
  { path: '/cashier/clients',      element: <ClientsPage />,      roles: ['Cashier'] },
  { path: '/cashier/clients/:id',  element: <ClientDetailPage />, roles: ['Cashier'] },
  { path: '/cashier/ops',          element: <OperationsPage />,   roles: ['Cashier'] },
  { path: '/cashier/reports',      element: <ReportsPage />,      roles: ['Cashier'] },
  { path: '/cashier/fraud',        element: <CashierFraudPage />, roles: ['Cashier'] },

  // Админ
  { path: '/admin',           element: <AdminDashboard />, roles: ['Admin'] },
  { path: '/admin/users',     element: <UsersPage />,      roles: ['Admin'] },
  { path: '/admin/audit',     element: <AuditPage />,      roles: ['Admin'] },
  { path: '/admin/analytics', element: <AnalyticsPage />,  roles: ['Admin'] },
  { path: '/admin/fraud',     element: <AdminFraudPage />, roles: ['Admin'] },
];

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <BrowserRouter>
              <ThemeToggle floating />
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  {ROUTES.map(({ path, element, roles }) => (
                    <Route
                      key={path}
                      path={path}
                      element={roles ? <PrivateRoute roles={roles}>{element}</PrivateRoute> : element}
                    />
                  ))}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
