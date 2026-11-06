import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Baseline,
  Bold,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Strikethrough,
  Underline,
} from 'lucide-react';
import { normalizeLinkUrl, notesToHtml, richTextToPlain } from '../lib/richText';
import type { Language } from '../types';

/**
 * Small WYSIWYG editor for request descriptions.
 * Uses contentEditable + execCommand (supported by every target browser, including iOS Safari)
 * instead of a heavy editor library. The output is sanitized by the caller before saving.
 * The toolbar is `sticky`, so it stays visible while a long description scrolls.
 */

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  language: Language;
  placeholder?: string;
  id?: string;
  /**
   * Tailwind `top-*` class for the sticky toolbar. Use a negative value equal to the scroll
   * container's top padding so the toolbar sits flush against the container edge.
   */
  stickyTopClass?: string;
}

const LABELS = {
  en: {
    bold: 'Bold',
    italic: 'Italic',
    underline: 'Underline',
    strike: 'Strikethrough',
    color: 'Text color',
    defaultColor: 'Default',
    numbered: 'Numbered list',
    bullets: 'Bulleted list',
    indent: 'Increase indent',
    outdent: 'Decrease indent',
    link: 'Insert link',
    linkPlaceholder: 'https://… or email',
    insert: 'Insert',
    cancel: 'Cancel',
    invalidLink: 'Enter a valid web address or email.',
    toolbar: 'Formatting',
  },
  es: {
    bold: 'Negrita',
    italic: 'Cursiva',
    underline: 'Subrayado',
    strike: 'Tachado',
    color: 'Color de texto',
    defaultColor: 'Predeterminado',
    numbered: 'Lista numerada',
    bullets: 'Lista con viñetas',
    indent: 'Aumentar sangría',
    outdent: 'Disminuir sangría',
    link: 'Insertar enlace',
    linkPlaceholder: 'https://… o correo',
    insert: 'Insertar',
    cancel: 'Cancelar',
    invalidLink: 'Escriba una dirección web o correo válido.',
    toolbar: 'Formato',
  },
} as const;

const COLORS = ['#202124', '#D93025', '#E37400', '#137333', '#1A73E8', '#8430CE', '#6D4627', '#5F6368'];

type ToggleCommand = 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'insertOrderedList' | 'insertUnorderedList';
const TOGGLES: ToggleCommand[] = ['bold', 'italic', 'underline', 'strikeThrough', 'insertOrderedList', 'insertUnorderedList'];

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, language, placeholder, id, stickyTopClass = 'top-0' }) => {
  const L = LABELS[language];
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [active, setActive] = useState<Set<ToggleCommand>>(new Set());
  const [isEmpty, setIsEmpty] = useState(() => richTextToPlain(value) === '');
  const [showColors, setShowColors] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState(false);

  // Load the initial value once; afterwards the DOM is the source of truth (keeps the caret stable).
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = value ? notesToHtml(value) : '';
  }, []);

  const selectionInEditor = useCallback((): Range | null => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return null;
    const range = sel.getRangeAt(0);
    return editorRef.current.contains(range.commonAncestorContainer) ? range : null;
  }, []);

  const refreshActive = useCallback(() => {
    if (!selectionInEditor()) return;
    const next = new Set<ToggleCommand>();
    for (const cmd of TOGGLES) {
      try {
        if (document.queryCommandState(cmd)) next.add(cmd);
      } catch {
        /* unsupported command state */
      }
    }
    setActive(next);
  }, [selectionInEditor]);

  useEffect(() => {
    document.addEventListener('selectionchange', refreshActive);
    return () => document.removeEventListener('selectionchange', refreshActive);
  }, [refreshActive]);

  const emit = () => {
    const html = editorRef.current?.innerHTML ?? '';
    setIsEmpty(richTextToPlain(html) === '' && !/<(ol|ul|li)\b/i.test(html));
    onChange(html);
  };

  const exec = (command: string, arg?: string) => {
    editorRef.current?.focus();
    if (savedRange.current) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRange.current);
      savedRange.current = null;
    }
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command, false, arg);
    emit();
    refreshActive();
  };

  // Keeps the editor's selection when a toolbar button is pressed.
  const keepSelection = (e: React.MouseEvent) => e.preventDefault();

  const openLink = () => {
    savedRange.current = selectionInEditor()?.cloneRange() ?? null;
    const selected = savedRange.current?.toString().trim() ?? '';
    setLinkUrl(/^(https?:\/\/|www\.)/i.test(selected) ? selected : '');
    setLinkError(false);
    setShowColors(false);
    setLinkOpen(true);
  };

  const insertLink = () => {
    const url = normalizeLinkUrl(linkUrl);
    if (!url) {
      setLinkError(true);
      return;
    }
    const range = savedRange.current;
    if (!range || range.collapsed) {
      const text = url.replace(/^mailto:/, '');
      exec('insertHTML', `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>&nbsp;`);
    } else {
      exec('createLink', url);
    }
    setLinkOpen(false);
    setLinkUrl('');
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    // Paste as plain text: formatting from other apps is unpredictable and mostly not allowed.
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    emit();
  };

  const btn = (label: string, icon: React.ReactNode, onClick: () => void, isActive = false) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={isActive}
      onMouseDown={keepSelection}
      onClick={onClick}
      className={`p-1.5 rounded transition-colors cursor-pointer ${
        isActive ? 'bg-[#F4EFEA] text-[#6D4627]' : 'text-[#5F6368] hover:bg-[#F3F3F1] hover:text-[#202124]'
      }`}
    >
      {icon}
    </button>
  );

  const sep = <span className="w-px h-5 bg-[#DADCE0] mx-0.5" aria-hidden />;
  const icon = 'w-4 h-4';

  return (
    <div className="border border-[#DADCE0] rounded focus-within:border-[#1A73E8] bg-white">
      <div
        role="toolbar"
        aria-label={L.toolbar}
        className={`sticky ${stickyTopClass} z-10 bg-[#FAFAFA] border-b border-[#DADCE0] rounded-t px-1.5 py-1`}
      >
        <div className="flex flex-wrap items-center gap-0.5">
          {btn(L.bold, <Bold className={icon} />, () => exec('bold'), active.has('bold'))}
          {btn(L.italic, <Italic className={icon} />, () => exec('italic'), active.has('italic'))}
          {btn(L.underline, <Underline className={icon} />, () => exec('underline'), active.has('underline'))}
          {btn(L.strike, <Strikethrough className={icon} />, () => exec('strikeThrough'), active.has('strikeThrough'))}
          {sep}
          <div className="relative">
            {btn(L.color, <Baseline className={icon} />, () => {
              setLinkOpen(false);
              setShowColors((v) => !v);
            })}
            {showColors && (
              <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-[#DADCE0] rounded-md shadow-lg p-2 w-40">
                <div className="grid grid-cols-4 gap-1.5">
                  {COLORS.map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      title={i === 0 ? L.defaultColor : c}
                      aria-label={i === 0 ? L.defaultColor : c}
                      onMouseDown={keepSelection}
                      onClick={() => {
                        exec('foreColor', c);
                        setShowColors(false);
                      }}
                      className="w-7 h-7 rounded-full border border-[#DADCE0] cursor-pointer hover:scale-110 transition-transform"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          {sep}
          {btn(L.numbered, <ListOrdered className={icon} />, () => exec('insertOrderedList'), active.has('insertOrderedList'))}
          {btn(L.bullets, <List className={icon} />, () => exec('insertUnorderedList'), active.has('insertUnorderedList'))}
          {btn(L.outdent, <IndentDecrease className={icon} />, () => exec('outdent'))}
          {btn(L.indent, <IndentIncrease className={icon} />, () => exec('indent'))}
          {sep}
          {btn(L.link, <Link2 className={icon} />, openLink)}
        </div>

        {linkOpen && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1.5 pb-0.5">
            <input
              type="text"
              inputMode="url"
              autoFocus
              value={linkUrl}
              onChange={(e) => {
                setLinkUrl(e.target.value);
                setLinkError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  insertLink();
                } else if (e.key === 'Escape') {
                  setLinkOpen(false);
                }
              }}
              placeholder={L.linkPlaceholder}
              className={`flex-1 min-w-[10rem] bg-white border rounded px-2 py-1 text-xs focus:outline-hidden ${
                linkError ? 'border-[#D93025]' : 'border-[#DADCE0] focus:border-[#1A73E8]'
              }`}
            />
            <button
              type="button"
              onClick={insertLink}
              className="px-2.5 py-1 text-xs font-medium rounded bg-[#6D4627] hover:bg-[#55361D] text-white cursor-pointer"
            >
              {L.insert}
            </button>
            <button
              type="button"
              onClick={() => setLinkOpen(false)}
              className="px-2.5 py-1 text-xs font-medium rounded border border-[#DADCE0] text-[#5F6368] hover:bg-[#F3F3F1] cursor-pointer"
            >
              {L.cancel}
            </button>
            {linkError && <span className="w-full text-[11px] text-[#D93025]">{L.invalidLink}</span>}
          </div>
        )}
      </div>

      <div className="relative">
        {isEmpty && placeholder && (
          <div className="absolute inset-0 px-3 py-2 text-sm text-[#9AA0A6] pointer-events-none select-none">
            {placeholder}
          </div>
        )}
        <div
          id={id}
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          onInput={emit}
          onPaste={handlePaste}
          onFocus={() => setShowColors(false)}
          className="rich-text min-h-[6rem] px-3 py-2 text-sm text-[#202124] leading-relaxed focus:outline-hidden break-words"
        />
      </div>
    </div>
  );
};
