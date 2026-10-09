import { useEffect, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/ui/Modal';
import Skeleton from '../../components/ui/Skeleton';
import { authAPI } from '../../api/auth';
import { getProfile, updateProfile } from '../../api/accounts';
import { getResponseData } from '../../api/response';
import { formatDateLong, formatDateTime } from '../../utils/format';
import { formatPhoneInput, normalizePhoneForApi } from '../../utils/phone';
import {
  Edit3, Shield, History, MapPin,
} from 'lucide-react';

const ROLE_LABEL = { Customer: 'Клиент', Cashier: 'Кассир', Admin: 'Администратор' };

function normalizeText(value) {
  const text = String(value || '').trim();
  return text.length > 0 ? text : null;
}

function buildProfileForm(profile) {
  return {
    firstName: profile?.firstName || '',
    lastName: profile?.lastName || '',
    phoneNumber: formatPhoneInput(profile?.phoneNumber || ''),
  };
}

function initialPasswordForm() {
  return { currentPassword: '', newPassword: '', confirmNewPassword: '' };
}

export default function ProfilePage() {
  const { user, syncUser } = useAuth();
  const { setTheme } = useTheme();
  const toast = useToast();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileForm, setProfileForm] = useState(buildProfileForm(user));
  const [passwordForm, setPasswordForm] = useState(initialPasswordForm());
  const [loginHistory, setLoginHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    getProfile()
      .then(getResponseData)
      .then((data) => {
        if (cancelled) return;

        setProfile(data);
        setProfileForm(buildProfileForm(data));
        syncUser(data);

        // Применяем тему из серверных настроек, не перетирая выбор пользователя.
        const remoteTheme = data?.settings?.language ? data?.settings?.theme : null;
        if (remoteTheme === 'dark' || remoteTheme === 'light') {
          setTheme(remoteTheme, { persist: false });
        }
      })
      .catch(() => {
        if (cancelled) return;
        toast.danger('Не удалось загрузить профиль');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [syncUser]);

  useEffect(() => {
    let cancelled = false;

    setHistoryLoading(true);
    authAPI.loginHistory({ page: 1, pageSize: 5 })
      .then(getResponseData)
      .then((response) => {
        if (cancelled) return;
        const list = Array.isArray(response?.data) ? response.data : (Array.isArray(response) ? response : []);
        setLoginHistory(list);
      })
      .catch(() => {
        if (!cancelled) setLoginHistory([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const currentProfile = profile || user;

  const openEdit = () => {
    setProfileForm(buildProfileForm(currentProfile));
    setShowEdit(true);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);

    try {
      const response = await updateProfile({
        firstName: normalizeText(profileForm.firstName),
        lastName: normalizeText(profileForm.lastName),
        phoneNumber: normalizePhoneForApi(profileForm.phoneNumber),
      }).then(getResponseData);

      const nextProfile = {
        ...currentProfile,
        ...response,
      };

      setProfile(nextProfile);
      syncUser(nextProfile);
      setShowEdit(false);
      toast.success('Профиль обновлён');
    } catch (error) {
      const message = error?.response?.data?.detail || error?.response?.data?.message || 'Не удалось сохранить профиль';
      toast.danger(message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmNewPassword) {
      toast.danger('Заполните все поля пароля');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      toast.danger('Новый пароль и подтверждение не совпадают');
      return;
    }

    setSavingPassword(true);

    try {
      await authAPI.changePassword(passwordForm);
      setPasswordForm(initialPasswordForm());
      setShowPassword(false);
      toast.success('Пароль изменён');
    } catch (error) {
      const message = error?.response?.data?.detail || error?.response?.data?.message || 'Не удалось изменить пароль';
      toast.danger(message);
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading && !currentProfile) {
    return <Layout title="Профиль"><div className="card u-loading-card">Загрузка...</div></Layout>;
  }

  if (!currentProfile) {
    return (
      <Layout title="Профиль">
        <div className="card u-loading-card">
          <p>Не удалось загрузить профиль.</p>
          <button className="btn btn--primary u-mt-16" onClick={() => window.location.reload()}>
            Повторить
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Профиль">
      <div className="page__header">
        <div>
          <div className="page__title">Профиль</div>
          <div className="page__subtitle">Личные данные, безопасность и настройки</div>
        </div>
      </div>

      <div className="profile-layout">
        <div className="profile-layout__main">
          <div className="profile-card">
            <div className="profile-card__header">
              <div className="profile-card__avatar">{currentProfile.avatar || (currentProfile.fullName || '?').charAt(0)}</div>
              <div className="profile-card__header-text">
                <div className="profile-card__name">{currentProfile.fullName}</div>
                <div className="profile-card__meta">{currentProfile.email} · {ROLE_LABEL[currentProfile.role] || currentProfile.role}</div>
              </div>
              <button
                className="btn btn--ghost btn--sm profile-card__edit-btn"
                onClick={openEdit}
                aria-label="Редактировать профиль"
              >
                <Edit3 size={15} /> Редактировать
              </button>
            </div>

            {[
              ['Email', currentProfile.email],
              ['Телефон', currentProfile.phoneNumber],
              ['Дата рождения', formatDateLong(currentProfile.dateOfBirth)],
              ['Роль', ROLE_LABEL[currentProfile.role] || currentProfile.role],
              ['Дата регистрации', formatDateLong(currentProfile.createdAt)],
              ['Последний вход', formatDateTime(currentProfile.lastLoginAt)],
              ['ID пользователя', currentProfile.id],
            ].map(([label, value]) => (
              <div key={label} className="profile-card__row">
                <span className="profile-card__key">{label}</span>
                <span className="profile-card__val">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="profile-layout__side">
          <div className="profile-panels">
            <div className="card profile-panel profile-panel--security">
              <div className="profile-panel__header">
                <div className="profile-panel__icon profile-panel__icon--security">
                  <Shield size={16} />
                </div>
                <div>
                  <div className="profile-panel__title">Безопасность</div>
                  <div className="profile-panel__subtitle">Пароль и двухфакторная защита</div>
                </div>
              </div>

              <div className="profile-action-row">
                <div className="profile-action-row__copy">
                  <div className="profile-action-row__label">Пароль</div>
                  <div className="profile-action-row__hint">Регулярно меняйте пароль и не используйте его на других сайтах.</div>
                </div>
                <button className="btn btn--ghost btn--sm profile-inline-btn" onClick={() => setShowPassword(true)}>
                  Изменить
                </button>
              </div>
            </div>

            <div className="card profile-panel profile-panel--history">
              <div className="profile-panel__header">
                <div className="profile-panel__icon profile-panel__icon--history">
                  <History size={16} />
                </div>
                <div>
                  <div className="profile-panel__title">История входов</div>
                  <div className="profile-panel__subtitle">Последние 5 событий</div>
                </div>
              </div>

              {historyLoading && (
                <div className="profile-history__list" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="profile-history__item">
                      <div className="profile-history__main">
                        <Skeleton width={70} height={18} radius={6} />
                        <Skeleton width={120} height={12} />
                      </div>
                      <Skeleton width="60%" height={11} />
                    </div>
                  ))}
                </div>
              )}

              {!historyLoading && loginHistory.length === 0 && (
                <div className="profile-history__empty">События не найдены</div>
              )}

              {!historyLoading && loginHistory.length > 0 && (
                <ul className="profile-history__list">
                  {loginHistory.map((item) => (
                    <li key={item.id} className="profile-history__item">
                      <div className="profile-history__main">
                        <span className={`badge badge--${item.status === 'Success' ? 'success' : 'danger'} profile-history__badge`}>
                          {item.status === 'Success' ? 'Успешно' : 'Ошибка'}
                        </span>
                        <span className="profile-history__time">{formatDateTime(item.createdAt)}</span>
                      </div>
                      <div className="profile-history__meta">
                        <MapPin size={11} /> {item.ipAddress || '—'}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {showEdit && (
        <Modal
          title="Редактировать профиль"
          onClose={() => setShowEdit(false)}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => setShowEdit(false)}>Отмена</button>
              <button className="btn btn--primary" onClick={handleSaveProfile} disabled={savingProfile}>
                {savingProfile ? 'Сохранение...' : 'Сохранить'}
              </button>
            </>
          }
        >
          <p className="profile-edit-note">
            Здесь доступны только реальные поля, которые поддерживает сервер: имя, фамилия и телефон.
          </p>

          <div className="profile-edit-grid">
            <section className="profile-edit-section">
              <div className="profile-edit-section__title">Основные данные</div>
              <div className="profile-edit-row">
                <div className="form-group">
                  <label>Имя</label>
                  <input value={profileForm.firstName} onChange={(e) => setProfileForm((prev) => ({ ...prev, firstName: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Фамилия</label>
                  <input value={profileForm.lastName} onChange={(e) => setProfileForm((prev) => ({ ...prev, lastName: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>Телефон</label>
                <input
                  type="tel"
                  inputMode="tel"
                  maxLength={18}
                  value={profileForm.phoneNumber}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, phoneNumber: formatPhoneInput(e.target.value) }))}
                />
              </div>
            </section>
          </div>
        </Modal>
      )}

      {showPassword && (
        <Modal
          title="Изменить пароль"
          onClose={() => setShowPassword(false)}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => setShowPassword(false)}>Отмена</button>
              <button className="btn btn--primary" onClick={handleChangePassword} disabled={savingPassword}>
                {savingPassword ? 'Сохранение...' : 'Сменить пароль'}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label>Текущий пароль</label>
            <input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Новый пароль</label>
            <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Подтверждение пароля</label>
            <input type="password" value={passwordForm.confirmNewPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmNewPassword: e.target.value }))} />
          </div>
        </Modal>
      )}
    </Layout>
  );
}
