import { useEffect, useRef, useState } from 'react';
import { createFraudHubConnection } from '../utils/fraudAlerts';

export function useFraudAlertsRealtime({
  enabled = true,
  onNewAlert,
  onAlertUpdated,
  onStateChange,
  onError,
} = {}) {
  const handlersRef = useRef({ onNewAlert, onAlertUpdated, onStateChange, onError });
  const [connectionState, setConnectionState] = useState(enabled ? 'connecting' : 'disabled');

  useEffect(() => {
    handlersRef.current = { onNewAlert, onAlertUpdated, onStateChange, onError };
  }, [onNewAlert, onAlertUpdated, onStateChange, onError]);

  useEffect(() => {
    if (!enabled) {
      setConnectionState('disabled');
      handlersRef.current.onStateChange?.('disabled');
      return undefined;
    }

    let disposed = false;
    const connection = createFraudHubConnection();

    const updateState = (nextState) => {
      if (disposed) return;
      setConnectionState(nextState);
      handlersRef.current.onStateChange?.(nextState);
    };

    const handleNewAlert = (payload) => {
      handlersRef.current.onNewAlert?.(payload);
    };

    const handleAlertUpdated = (payload) => {
      handlersRef.current.onAlertUpdated?.(payload);
    };

    connection.on('newFraudAlert', handleNewAlert);
    connection.on('fraudAlertUpdated', handleAlertUpdated);
    connection.onreconnecting(() => updateState('reconnecting'));
    connection.onreconnected(() => updateState('connected'));
    connection.onclose(() => updateState('disconnected'));

    updateState('connecting');

    connection.start()
      .then(() => updateState('connected'))
      .catch((error) => {
        updateState('error');
        handlersRef.current.onError?.(error);
      });

    return () => {
      disposed = true;
      connection.off('newFraudAlert', handleNewAlert);
      connection.off('fraudAlertUpdated', handleAlertUpdated);
      connection.stop().catch(() => {});
    };
  }, [enabled]);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    isReconnecting: connectionState === 'reconnecting',
    isErrored: connectionState === 'error',
  };
}