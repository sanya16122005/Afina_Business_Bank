import Modal from './Modal';

export default function SystemNoticeModal({ onClose }) {
  return (
    <Modal
      title="Демо-версия Афина Банка"
      onClose={onClose}
      footer={
        <button className="btn btn--primary" onClick={onClose} type="button">
          Понятно
        </button>
      }
    >
      <div className="system-notice">
        <div className="alert alert--warning" style={{ marginBottom: 0 }}>
          Это демонстрационный портфолио-проект, а не действующий банк. Все данные тестовые.
        </div>
        <p className="system-notice__lead">
          Для входа можно использовать демо-учётки прямо со страницы логина — кнопки внизу формы.
        </p>
        <p className="system-notice__text">
          Регистрация открыта, но реальные финансовые операции не выполняются.
        </p>
      </div>
    </Modal>
  );
}
