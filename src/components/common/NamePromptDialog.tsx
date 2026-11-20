import { useEffect, useRef, useState } from 'react';
import { nameDialogService, type NameDialogRequest } from '@/services/name-dialog.service';

export function NamePromptDialog() {
  const [request, setRequest] = useState<NameDialogRequest | null>(null);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogKey = useRef(0);

  useEffect(() => {
    return nameDialogService.subscribe((nextRequest) => {
      if (nextRequest?.open) {
        dialogKey.current += 1;
      }
      setRequest(nextRequest);
      setValue(nextRequest?.defaultValue || '');
    });
  }, []);

  useEffect(() => {
    if (!request?.open) return;
    // 使用 requestAnimationFrame 确保 DOM 完全渲染后再聚焦并全选
    const raf = requestAnimationFrame(() => {
      const input = inputRef.current;
      if (input) {
        input.focus();
        input.select();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [request]);

  useEffect(() => {
    if (!request?.open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        nameDialogService.cancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [request]);

  if (!request?.open) return null;

  const submit = () => {
    const trimmed = value.trim() || request.defaultValue;
    nameDialogService.confirm(trimmed);
  };

  return (
    <div className="name-dialog-overlay" onClick={() => nameDialogService.cancel()}>
      <div className="name-dialog-card" onClick={(event) => event.stopPropagation()}>
        <div className="name-dialog-title">{request.title}</div>
        {request.message ? <div className="name-dialog-message">{request.message}</div> : null}
        <input
          ref={inputRef}
          className="input name-dialog-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
          onCompositionStart={() => {
            // 中文输入法开始组合输入，保持输入框焦点
          }}
        />
        <div className="name-dialog-actions">
          <button className="button" type="button" onClick={() => nameDialogService.cancel()}>
            {request.cancelText}
          </button>
          <button className="button button-primary" type="button" onClick={submit}>
            {request.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
