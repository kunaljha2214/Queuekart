/**
 * App-wide alert (replaces React Native Alert.alert).
 * Requires <AppAlertHost /> mounted inside ThemeProvider (see App.tsx).
 */

let showImpl = null;

export function registerAppAlert(showFn) {
  showImpl = showFn;
}

function normalizeButtons(buttons) {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    return [{ text: 'OK', style: 'default' }];
  }
  return buttons.map((b) => ({
    text: String(b?.text ?? 'OK'),
    style: b?.style === 'cancel' || b?.style === 'destructive' ? b.style : 'default',
    onPress: typeof b?.onPress === 'function' ? b.onPress : undefined,
  }));
}

/**
 * Same shape as Alert.alert(title, message?, buttons?)
 * @param {string} title
 * @param {string} [message]
 * @param {Array<{text: string, style?: 'default'|'cancel'|'destructive', onPress?: () => void}>} [buttons]
 */
export function appAlert(title, message, buttons) {
  const t = title == null ? '' : String(title);
  let msg = '';
  let btns = normalizeButtons();

  if (arguments.length === 1) {
    msg = '';
  } else if (arguments.length === 2) {
    if (Array.isArray(message)) {
      btns = normalizeButtons(message);
      msg = '';
    } else {
      msg = message == null ? '' : String(message);
    }
  } else {
    msg = message == null ? '' : String(message);
    btns = normalizeButtons(buttons);
  }

  if (typeof showImpl === 'function') {
    showImpl({ title: t, message: msg, buttons: btns });
  } else if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn('[appAlert] AppAlertHost not mounted:', t, msg);
  }
}
