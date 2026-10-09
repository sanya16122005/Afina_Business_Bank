import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShieldCheck, TrendingUp, Zap, CreditCard,
  Globe, Users, Lock, ArrowRight, CheckCircle2,
  Clock, Banknote, Landmark, Star, ChevronDown,
} from 'lucide-react';
import AfinaLogo from '../../components/ui/AfinaLogo';
import GlassBackground from '../../components/layout/GlassBackground';
import Modal from '../../components/ui/Modal';

/* ── Данные ──────────────────────────────────── */

const STATS = [
  { value: '8',         label: 'Активных клиентов',     icon: <Users size={18} /> },
  { value: '1 200 ₽',   label: 'Активов клиентов',      icon: <Banknote size={18} /> },
  { value: 'до 7%',     label: 'Годовых на сбережениях', icon: <TrendingUp size={18} /> },
  { value: '24/7',      label: 'Поддержка и переводы',   icon: <Zap size={18} /> },
];

const FEATURES = [
  {
    icon: <ShieldCheck size={24} />,
    title: 'Двухфакторная аутентификация',
    desc: 'Вход подтверждается 6-значным кодом из письма на email.',
    tag: '2FA',
  },
  {
    icon: <TrendingUp size={24} />,
    title: 'Доходность до 7% годовых',
    desc: 'До 7% годовых на сберегательном счёте с ежемесячной капитализацией.',
    tag: 'Высокий %',
  },
  {
    icon: <Zap size={24} />,
    title: 'Мгновенные переводы',
    desc: 'Самые быстрые переводы между своими счетами и клиентами банка.',
  },
  {
    icon: <CreditCard size={24} />,
    title: 'Мультивалютные карты',
    desc: 'Дебетовые и виртуальные карты в RUB, USD, EUR.',
    tag: 'Visa',
  },
  {
    icon: <Globe size={24} />,
    title: 'Реалтайм-уведомления',
    desc: 'Подозрительные операции и обновления антифрода приходят на админ-панель моментально через SignalR.',
    tag: 'SignalR',
  },
  {
    icon: <Lock size={24} />,
    title: 'Прозрачный антифрод',
    desc: 'По каждой подозрительной операции показываем понятное объяснение, а не только риск-скор.',
    tag: 'LLM / AI',
  },
];

const TARIFFS = [
  {
    name: 'Расчётный',
    type: 'Стартовый',
    rate: '0',
    rateSuffix: '₽/мес',
    color: 'slate',
    features: [
      { text: 'Дебетовая карта в RUB, USD или EUR', included: true },
      { text: 'Бесплатные переводы между своими счетами', included: true },
      { text: 'Виртуальная карта', included: true },
      { text: 'Дизайн карты на выбор', included: true },
    ],
    cta: 'Открыть бесплатно',
  },
  {
    name: 'Сберегательный',
    type: 'С процентом на остаток',
    rate: '0',
    rateSuffix: '₽/мес',
    interest: 'до 7% годовых на остаток',
    color: 'emerald',
    featured: true,
    badge: 'Популярный',
    features: [
      { text: 'Капитализация ежемесячно', included: true },
      { text: 'Первое снятие — без комиссии', included: true },
      { text: 'Далее: комиссия 2.5% за снятие', included: true },
      { text: 'Открытие за пару кликов', included: true },
    ],
    cta: 'Открыть счёт',
  },
  {
    name: 'Зарплатный',
    type: 'Для сотрудников',
    rate: '0',
    rateSuffix: '₽/мес',
    color: 'gold',
    badge: 'Без комиссий',
    features: [
      { text: 'Без комиссии за снятие наличных', included: true },
      { text: 'Без комиссии за переводы между счетами', included: true },
      { text: 'Только в рублях (RUB)', included: true },
      { text: 'Бесплатная дебетовая карта', included: true },
    ],
    cta: 'Открыть счёт',
  },
  {
    name: 'Кредитный',
    type: 'Расчётный с овердрафтом',
    rate: '0',
    rateSuffix: '₽/мес',
    color: 'dark',
    features: [
      { text: 'Без абонентской платы', included: true },
      { text: 'Комиссия 0.2% только при отрицательном балансе', included: true },
      { text: 'Карта в RUB, USD или EUR', included: true },
      { text: 'Контроль операций через антифрод', included: true },
    ],
    cta: 'Открыть счёт',
  },
];

const LEGAL_DOCS = {
  privacy: {
    title: 'Политика конфиденциальности',
    body: 'Это демо-проект — реальной обработки персональных данных не происходит. В боевой версии здесь будет полный текст политики обработки персональных данных в соответствии с 152-ФЗ.',
  },
  terms: {
    title: 'Условия использования',
    body: 'Это демо-проект — реальные финансовые операции не выполняются. В боевой версии здесь будет договор на банковское обслуживание со всеми существенными условиями.',
  },
};

/* ── Компонент ───────────────────────────────── */

export default function LandingPage() {
  const navigate = useNavigate();
  const [navState, setNavState] = useState('intro');
  const [showScroll, setShowScroll] = useState(false);
  const [legalDoc, setLegalDoc] = useState(null);
  const lastScroll = useRef(0);

  // Nav hide/show + scroll-tab
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < 80) {
          setNavState('intro');
        } else if (y > 300) {
          setNavState(y > lastScroll.current ? 'hidden' : 'visible');
        } else {
          setNavState('visible');
        }
        setShowScroll(y < 200);
        lastScroll.current = y;
        ticking = false;
      });
    };
    const timer = setTimeout(() => setShowScroll(true), 1200);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); clearTimeout(timer); };
  }, []);

  // Intersection Observer: reveal
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('revealed'); observer.unobserve(e.target); }
      }),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const smoothScroll = useCallback((e) => {
    const href = e.currentTarget.getAttribute('href');
    if (!href?.startsWith('#')) return;
    const target = document.getElementById(href.slice(1));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
  }, []);

  return (
    <div className="landing-page">
      <GlassBackground />

      {/* ── NAV ──────────────────────────── */}
      <nav className={`landing-nav landing-nav--${navState}`}>
        <div className="landing-container landing-nav__inner">
          <div className="landing-nav__logo">
            <AfinaLogo size={36} showText textStyle="short" useThemeColor />
          </div>
          <div className="landing-nav__links">
            <a href="#features" onClick={smoothScroll}>Возможности</a>
            <a href="#tariffs" onClick={smoothScroll}>Счета</a>
            <a href="#contacts" onClick={smoothScroll}>Контакты</a>
          </div>
          <button className="landing-nav__btn" onClick={() => navigate('/login')}>
            Войти
          </button>
        </div>
      </nav>

      {/* ── HERO ──────────────────────────── */}
      <section className="landing-hero">

        <div className="landing-container landing-hero__content">
          <span className="landing-hero__tag">
            <Landmark size={12} /> Демо-версия · Портфолио-проект
          </span>
          <h1 className="landing-hero__title">
            Банк, где счёт открывается<br /><span>за 5 минут</span>
          </h1>
          <p className="landing-hero__sub">
            Все типы счетов в одном банке: расчётные, сберегательные, зарплатные и кредитные.
            До 7% годовых, мгновенные переводы и открытое API.
          </p>
          <div className="landing-hero__actions">
            <button className="landing-btn landing-btn--primary landing-btn--glow" onClick={() => navigate('/register')}>
              Открыть счёт <ArrowRight size={15} />
            </button>
            <button className="landing-btn landing-btn--outline" onClick={() => navigate('/login')}>
              Войти в интернет-банк
            </button>
            <button className="landing-btn landing-btn--outline" onClick={() => navigate('/register-legal')}>
              Для бизнеса (ИП, ООО)
            </button>
          </div>
        </div>

        <a
          href="#stats"
          onClick={smoothScroll}
          className={`landing-hero__scroll-tab${showScroll ? ' landing-hero__scroll-tab--visible' : ' landing-hero__scroll-tab--gone'}`}
        >
          <ChevronDown size={14} />
          <span className="landing-hero__scroll-tab-text">Узнать больше</span>
        </a>
      </section>

      {/* ── STATS ────────────────────────── */}
      <section className="landing-stats reveal" id="stats">
        <div className="landing-container">
          <div className="landing-stats__grid">
            {STATS.map((s) => (
              <div className="landing-stats__item" key={s.label}>
                <div className="landing-stats__icon">{s.icon}</div>
                <div className="landing-stats__value">{s.value}</div>
                <div className="landing-stats__label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────── */}
      <section className="landing-features reveal" id="features">
        <div className="landing-container">
          <div className="landing-section-header">
            <span className="landing-section-header__tag">Возможности</span>
            <h2>Банковский сервис,<br />на который можно положиться</h2>
          </div>
          <div className="landing-features__grid">
            {FEATURES.map((f) => (
              <div className="landing-feature-card reveal" key={f.title}>
                <div className="landing-feature-card__head">
                  <div className="landing-feature-card__icon">{f.icon}</div>
                  <span className="landing-feature-card__tag">{f.tag}</span>
                </div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TARIFFS ──────────────────────── */}
      <section className="landing-tariffs reveal" id="tariffs">
        <div className="landing-container">
          <div className="landing-section-header">
            <span className="landing-section-header__tag">Счета</span>
            <h2>Виды счетов</h2>
            <p>Без скрытых комиссий. Выберите счёт под личные, зарплатные или корпоративные задачи.</p>
          </div>
          <div className="landing-tariffs__grid">
            {TARIFFS.map((t) => (
              <div className={`landing-tariff-card landing-tariff-card--${t.color}${t.featured ? ' landing-tariff-card--featured' : ''}`} key={t.name}>
                {t.badge && (
                  <div className="landing-tariff-card__badge"><Star size={10} /> {t.badge}</div>
                )}
                <div className="landing-tariff-card__header">
                  <div className="landing-tariff-card__name">{t.name}</div>
                  <div className="landing-tariff-card__type">{t.type}</div>
                </div>
                <div className="landing-tariff-card__price">
                  <span className="landing-tariff-card__rate">{t.rate}</span>
                  <span className="landing-tariff-card__suffix">{t.rateSuffix}</span>
                </div>
                {t.interest && (
                  <div className="landing-tariff-card__interest">
                    <TrendingUp size={13} /> {t.interest}
                  </div>
                )}
                <ul className="landing-tariff-card__list">
                  {t.features.map((ft, j) => (
                    <li key={j} className={ft.included ? '' : 'not-included'}>
                      {ft.included ? <CheckCircle2 size={14} className="check-icon" /> : <Clock size={14} className="clock-icon" />}
                      {ft.text}
                    </li>
                  ))}
                </ul>
                {t.ctaHref ? (
                  <a
                    className={`landing-btn ${t.featured ? 'landing-btn--primary landing-btn--glow' : 'landing-btn--outline'} landing-tariff-card__cta`}
                    href={t.ctaHref}
                  >
                    {t.cta} <ArrowRight size={14} />
                  </a>
                ) : (
                  <button
                    className={`landing-btn ${t.featured ? 'landing-btn--primary landing-btn--glow' : 'landing-btn--outline'} landing-tariff-card__cta`}
                    onClick={() => navigate('/register')}
                  >
                    {t.cta} <ArrowRight size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────── */}
      <section className="landing-cta reveal">
        <div className="landing-cta__glow" />
        <div className="landing-container landing-cta__inner">
          <h2>Готовы открыть счёт?</h2>
          <p>Откройте счёт за 5 минут — без визита в отделение.</p>
          <div className="landing-cta__actions">
            <button className="landing-btn landing-btn--primary landing-btn--glow" onClick={() => navigate('/register')}>
              Открыть счёт <ArrowRight size={15} />
            </button>
            <button className="landing-btn landing-btn--ghost" onClick={() => navigate('/login')}>
              Войти в интернет-банк
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────── */}
      <footer className="landing-footer reveal" id="contacts">
        <div className="landing-container">
          <div className="landing-footer__grid">
            <div>
              <div className="landing-footer__logo">
                <AfinaLogo size={32} showText textStyle="full" useThemeColor />
              </div>
              <p className="landing-footer__desc">Демонстрационный портфолио-проект цифрового банкинга. Не является действующим банком, реальные лицензии и страхование вкладов отсутствуют.</p>
            </div>
            <div>
              <div className="landing-footer__heading">Продукты</div>
              <div className="landing-footer__link">Расчётный счёт</div>
              <div className="landing-footer__link">Сберегательный счёт</div>
              <div className="landing-footer__link">Зарплатный счёт</div>
              <div className="landing-footer__link">Кредитный счёт</div>
            </div>
            <div>
              <div className="landing-footer__heading">Контакты</div>
              <div className="landing-footer__contact">support@your-bank-domain.com</div>
              <div className="landing-footer__contact">github.com/username/afina-bank</div>
            </div>
          </div>
          <div className="landing-footer__bottom">
            <span>© 2026 Демонстрационный проект «Банк Афина»</span>
            <div className="landing-footer__legal">
              <button type="button" className="landing-footer__legal-link" onClick={() => setLegalDoc('privacy')}>
                Политика конфиденциальности
              </button>
              <button type="button" className="landing-footer__legal-link" onClick={() => setLegalDoc('terms')}>
                Условия использования
              </button>
            </div>
          </div>
        </div>
      </footer>

      {legalDoc && (
        <Modal
          title={LEGAL_DOCS[legalDoc].title}
          onClose={() => setLegalDoc(null)}
          footer={
            <button type="button" className="btn btn--primary" onClick={() => setLegalDoc(null)}>
              Закрыть
            </button>
          }
        >
          <p>{LEGAL_DOCS[legalDoc].body}</p>
        </Modal>
      )}
    </div>
  );
}
