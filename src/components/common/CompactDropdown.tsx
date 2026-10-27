'use client';

import React, { useState, useRef, useEffect, useId, useMemo } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TRANSITIONS } from '@/lib/animations';

export interface CompactDropdownOption<T = string | number> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  sublabel?: string;
  badge?: string;
  badgeColor?: string;
  disabled?: boolean;
}

export interface CompactDropdownProps<T = string | number> {
  id?: string;
  label?: React.ReactNode;
  value: T;
  options: (CompactDropdownOption<T> | string | number)[];
  onChange: (value: T) => void;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  rightAction?: React.ReactNode;
  allowCustomInput?: boolean;
  onInputChange?: (value: string) => void;
  inputPlaceholder?: string;
  className?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
  size?: 'sm' | 'md' | 'lg';
  menuPlacement?: 'bottom' | 'top' | 'auto';
  emptyMessage?: string;
  name?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  autoCloseOnSelect?: boolean;
  testId?: string;
  inFlow?: boolean;
  disableInternalScroll?: boolean;
  maxListHeight?: string;
}

/**
 * Normalizes options into standard CompactDropdownOption format.
 */
function normalizeOptions<T = string | number>(
  rawOptions: (CompactDropdownOption<T> | string | number)[]
): CompactDropdownOption<T>[] {
  return rawOptions.map((opt) => {
    if (typeof opt === 'string' || typeof opt === 'number') {
      return {
        value: opt as unknown as T,
        label: String(opt),
      };
    }
    return opt;
  });
}

/**
 * Premium Compact Dropdown Component
 * Refined full-width box with rotating right-side chevron, searchable panel,
 * smooth animations, single-tap selection, click-outside dismissal, and accessible keyboard navigation.
 */
export function CompactDropdown<T = string | number>({
  id: explicitId,
  label,
  value,
  options: rawOptions,
  onChange,
  placeholder = 'Select option...',
  searchable,
  searchPlaceholder = 'Search...',
  disabled = false,
  icon,
  rightAction,
  allowCustomInput = false,
  onInputChange,
  inputPlaceholder,
  className = '',
  buttonClassName = '',
  dropdownClassName = '',
  size = 'md',
  menuPlacement = 'auto',
  emptyMessage = 'No matching options found',
  name,
  required = false,
  error,
  helperText,
  autoCloseOnSelect = true,
  testId,
  inFlow = false,
  disableInternalScroll = false,
  maxListHeight,
}: CompactDropdownProps<T>) {
  const generatedId = useId();
  const id = explicitId || generatedId;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Scroll detection refs to prevent accidental selection during touch dragging
  const isScrollingListRef = useRef(false);
  const listTouchStartYRef = useRef(0);
  const listTouchStartXRef = useRef(0);
  const listScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [placement, setPlacement] = useState<'top' | 'bottom'>('bottom');

  const normalizedOptions = useMemo(() => normalizeOptions(rawOptions), [rawOptions]);

  // Determine if search should be enabled (explicitly requested or list length > 6)
  const isSearchEnabled = searchable ?? normalizedOptions.length > 6;

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return normalizedOptions;
    const q = searchQuery.toLowerCase().trim();
    return normalizedOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(q))
    );
  }, [normalizedOptions, searchQuery]);

  // Find currently selected option
  const selectedOption = useMemo(() => {
    return normalizedOptions.find(
      (opt) => String(opt.value).toLowerCase() === String(value).toLowerCase()
    );
  }, [normalizedOptions, value]);

  // Handle click outside to close dropdown (safely distinguishing taps from scrolls)
  useEffect(() => {
    if (!isOpen) return;

    let touchMoved = false;
    let startX = 0;
    let startY = 0;

    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length === 1) {
        touchMoved = false;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }
    }

    function handleTouchMove(e: TouchEvent) {
      if (e.touches.length === 1) {
        const dx = Math.abs(e.touches[0].clientX - startX);
        const dy = Math.abs(e.touches[0].clientY - startY);
        if (dx > 8 || dy > 8) {
          touchMoved = true;
        }
      }
    }

    function handleTouchEnd(event: TouchEvent) {
      // Do not dismiss if the touch was part of a swipe or scroll gesture
      if (touchMoved) return;
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(-1);
      }
    }

    function handleMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(-1);
      }
    }

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isOpen]);

  // Compute smart vertical placement (auto flip to top if near bottom of screen)
  useEffect(() => {
    if (!isOpen || inFlow || menuPlacement !== 'auto' || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceNeeded = 260; // Approximate dropdown height

    if (spaceBelow < spaceNeeded && rect.top > spaceNeeded) {
      setPlacement('top');
    } else {
      setPlacement('bottom');
    }
  }, [isOpen, inFlow, menuPlacement]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && isSearchEnabled) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isSearchEnabled]);

  const toggleDropdown = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (disabled) return;
    if (!isOpen) {
      setIsOpen(true);
      setSearchQuery('');
      // Highlight currently selected option
      const currentIdx = filteredOptions.findIndex(
        (o) => String(o.value).toLowerCase() === String(value).toLowerCase()
      );
      setHighlightedIndex(currentIdx >= 0 ? currentIdx : 0);
    } else {
      setIsOpen(false);
      setSearchQuery('');
      setHighlightedIndex(-1);
    }
  };

  useEffect(() => {
    return () => {
      if (listScrollTimeoutRef.current) {
        clearTimeout(listScrollTimeoutRef.current);
      }
    };
  }, []);

  const handleListTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isScrollingListRef.current = false;
      listTouchStartYRef.current = e.touches[0].clientY;
      listTouchStartXRef.current = e.touches[0].clientX;
    }
  };

  const handleListTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const dy = Math.abs(e.touches[0].clientY - listTouchStartYRef.current);
      const dx = Math.abs(e.touches[0].clientX - listTouchStartXRef.current);
      if (dy > 6 || dx > 6) {
        isScrollingListRef.current = true;
      }
    }
  };

  const handleListTouchEnd = () => {
    if (isScrollingListRef.current) {
      if (listScrollTimeoutRef.current) {
        clearTimeout(listScrollTimeoutRef.current);
      }
      listScrollTimeoutRef.current = setTimeout(() => {
        isScrollingListRef.current = false;
      }, 120);
    }
  };

  const handleSelect = (option: CompactDropdownOption<T>, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    // Ignore accidental selection triggered while scrolling the options list
    if (!disableInternalScroll && isScrollingListRef.current) {
      return;
    }
    if (option.disabled) return;
    onChange(option.value);
    if (onInputChange) {
      onInputChange(option.label);
    }
    if (autoCloseOnSelect) {
      setIsOpen(false);
      setSearchQuery('');
      setHighlightedIndex(-1);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(-1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          handleSelect(filteredOptions[highlightedIndex]);
        }
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

  // Size styling tokens
  const sizeStyles = {
    sm: 'min-h-[36px] py-1.5 px-3 text-caption',
    md: 'min-h-[42px] sm:min-h-[44px] py-2 px-3.5 text-body-small',
    lg: 'min-h-[48px] py-2.5 px-4 text-body',
  };

  const currentDisplayLabel = allowCustomInput
    ? String(value ?? '')
    : selectedOption?.label || (value ? String(value) : '');

  return (
    <div
      ref={containerRef}
      className={`w-full relative flex flex-col ${className}`}
      onKeyDown={handleKeyDown}
      data-testid={testId || 'compact-dropdown-container'}
    >
      {/* Optional Label */}
      {label && (
        <label
          htmlFor={id}
          className="font-semibold text-caption block mb-1 text-[var(--foreground)]"
        >
          {label}
        </label>
      )}

      {/* Main Trigger Box */}
      <div
        className={`w-full relative rounded-xl border transition-all duration-150 flex items-center justify-between gap-2 shadow-2xs ${
          error
            ? 'border-red-500 bg-red-500/5 focus-within:ring-2 focus-within:ring-red-500/20'
            : isOpen
            ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-[var(--card)]'
            : 'border-[var(--border)] bg-[var(--card)] hover:border-emerald-500/50'
        } ${disabled ? 'opacity-55 cursor-not-allowed bg-[var(--muted)]/50' : ''} ${sizeStyles[size]} ${buttonClassName}`}
      >
        {/* Leading Icon / Badge */}
        {icon && (
          <div className="shrink-0 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            {icon}
          </div>
        )}

        {/* Input / Display Field */}
        {allowCustomInput ? (
          <input
            id={id}
            ref={inputRef}
            name={name}
            type="text"
            required={required}
            disabled={disabled}
            value={value !== undefined && value !== null ? String(value) : ''}
            onChange={(e) => {
              if (onInputChange) onInputChange(e.target.value);
              onChange(e.target.value as unknown as T);
            }}
            placeholder={inputPlaceholder || placeholder}
            className="flex-1 min-w-0 bg-transparent font-bold text-[var(--foreground)] focus:outline-none placeholder:text-[var(--muted-foreground)] placeholder:font-normal"
            onClick={(e) => e.stopPropagation()}
            onFocus={() => {
              if (!isOpen && normalizedOptions.length > 0) {
                setIsOpen(true);
              }
            }}
          />
        ) : (
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-controls={`${id}-menu`}
            disabled={disabled}
            onClick={toggleDropdown}
            className="flex-1 min-w-0 flex items-center gap-2 text-left bg-transparent border-0 p-0 m-0 focus:outline-none cursor-pointer"
          >
            {selectedOption?.icon && (
              <span className="shrink-0">{selectedOption.icon}</span>
            )}
            <span
              className={`truncate font-bold ${
                currentDisplayLabel
                  ? 'text-[var(--foreground)]'
                  : 'text-[var(--muted-foreground)] font-normal'
              }`}
            >
              {currentDisplayLabel || placeholder}
            </span>
            {selectedOption?.badge && (
              <span
                className={`ml-1 text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${
                  selectedOption.badgeColor || 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {selectedOption.badge}
              </span>
            )}
          </button>
        )}

        {/* Right Action + Chevron Button */}
        <div className="flex items-center gap-1 shrink-0">
          {rightAction}

          {/* Clean Dropdown Chevron Trigger Button */}
          <button
            type="button"
            disabled={disabled}
            onClick={toggleDropdown}
            aria-label={isOpen ? 'Close menu' : 'Open options menu'}
            className="p-1 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] active:scale-95 transition-all focus:outline-none focus:ring-1 focus:ring-emerald-500/50 cursor-pointer"
            title={isOpen ? 'Close options' : 'Show all options'}
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 stroke-[2.2] ${
                isOpen ? 'rotate-180 text-emerald-600 dark:text-emerald-400' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Helper text / error */}
      {error ? (
        <span className="text-[11px] text-red-500 font-medium mt-1 ml-1">{error}</span>
      ) : helperText ? (
        <span className="text-[11px] text-[var(--muted-foreground)] mt-1 ml-1">{helperText}</span>
      ) : null}

      {/* Dropdown Menu Panel with Framer Motion */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id={`${id}-menu`}
            role="listbox"
            initial={{ opacity: 0, y: inFlow ? -4 : (placement === 'top' ? 4 : -4), scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: inFlow ? -4 : (placement === 'top' ? 4 : -4), scale: 0.98 }}
            transition={TRANSITIONS.dropdown}
            className={`${
              inFlow
                ? 'relative z-20 w-full mt-1.5'
                : `absolute left-0 right-0 z-50 w-full min-w-[200px] ${
                    placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                  }`
            } bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden backdrop-blur-md ${dropdownClassName}`}
          >
            {/* Optional Search Filter Field */}
            {isSearchEnabled && (
              <div className="p-2 border-b border-[var(--border)]/70 bg-[var(--muted)]/40 flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0 ml-1" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full bg-transparent text-caption font-medium text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="p-1 hover:bg-[var(--muted)] rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {/* Options List */}
            <div
              ref={listRef}
              {...(!disableInternalScroll
                ? {
                    onTouchStart: handleListTouchStart,
                    onTouchMove: (e: React.TouchEvent) => {
                      e.stopPropagation();
                      handleListTouchMove(e);
                    },
                    onTouchEnd: handleListTouchEnd,
                    onWheel: (e: React.WheelEvent) => e.stopPropagation(),
                  }
                : {})}
              className={`${
                disableInternalScroll
                  ? 'overflow-visible py-1 divide-y divide-[var(--border)]/20 text-body-small'
                  : `${maxListHeight || 'max-h-56 sm:max-h-64'} overflow-y-auto overscroll-contain py-1 divide-y divide-[var(--border)]/20 text-body-small touch-pan-y`
              }`}
              style={
                !disableInternalScroll
                  ? {
                      WebkitOverflowScrolling: 'touch',
                      overscrollBehaviorY: 'contain',
                      touchAction: 'pan-y',
                    }
                  : undefined
              }
            >
              {filteredOptions.length === 0 ? (
                <div className="py-4 px-3 text-center text-caption text-[var(--muted-foreground)]">
                  {emptyMessage}
                </div>
              ) : (
                filteredOptions.map((option, index) => {
                  const isSelected =
                    String(option.value).toLowerCase() === String(value).toLowerCase();
                  const isHighlighted = highlightedIndex === index;

                  return (
                    <button
                      key={String(option.value) + index}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={option.disabled}
                      onClick={(e) => handleSelect(option, e)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-2.5 transition-colors cursor-pointer min-h-[40px] ${
                        option.disabled
                          ? 'opacity-40 cursor-not-allowed bg-[var(--muted)]/20'
                          : isSelected
                          ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 font-extrabold'
                          : isHighlighted
                          ? 'bg-[var(--muted)] text-[var(--foreground)]'
                          : 'text-[var(--foreground)] hover:bg-[var(--muted)]/60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {option.icon && (
                          <span className="shrink-0 text-emerald-600 dark:text-emerald-400">
                            {option.icon}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="block truncate font-bold text-body-small leading-tight">
                            {option.label}
                          </span>
                          {option.sublabel && (
                            <span className="block truncate text-[11px] text-[var(--muted-foreground)] font-normal mt-0.5">
                              {option.sublabel}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {option.badge && (
                          <span
                            className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full ${
                              option.badgeColor ||
                              'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            }`}
                          >
                            {option.badge}
                          </span>
                        )}
                        {isSelected && (
                          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
