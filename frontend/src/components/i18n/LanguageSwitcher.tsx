import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { supportedLanguages, type LanguageCode } from '@/i18n';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLanguage = supportedLanguages.find(
    (lang) => lang.code === i18n.language
  ) || supportedLanguages[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLanguageChange = (code: LanguageCode) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
    // Update HTML lang attribute
    document.documentElement.lang = code;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors',
          'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100',
          isOpen && 'bg-neutral-100'
        )}
        aria-label="Select language"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Globe className="w-4 h-4" />
        <span className="text-sm font-medium">{currentLanguage.flag}</span>
        <span className="text-sm hidden sm:inline">{currentLanguage.nativeName}</span>
        <ChevronDown className={cn(
          'w-4 h-4 transition-transform',
          isOpen && 'rotate-180'
        )} />
      </button>

      {isOpen && (
        <div 
          className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50"
          role="listbox"
          aria-label="Available languages"
        >
          {supportedLanguages.map((language) => (
            <button
              key={language.code}
              onClick={() => handleLanguageChange(language.code)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                'hover:bg-neutral-50',
                i18n.language === language.code && 'bg-primary-50'
              )}
              role="option"
              aria-selected={i18n.language === language.code}
            >
              <span className="text-lg">{language.flag}</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-neutral-900">
                  {language.nativeName}
                </p>
                <p className="text-xs text-neutral-500">{language.name}</p>
              </div>
              {i18n.language === language.code && (
                <Check className="w-4 h-4 text-primary-500" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
