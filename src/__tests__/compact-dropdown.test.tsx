import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompactDropdown } from '../components/common/CompactDropdown';

describe('CompactDropdown Component Suite', () => {
  const sampleOptions = [
    { value: 'RHB', label: 'Right-hand Batsman', badge: 'RHB' },
    { value: 'LHB', label: 'Left-hand Batsman', badge: 'LHB' },
    { value: 'ALL', label: 'All-rounder' },
  ];

  it('renders with placeholder and right chevron button', () => {
    const html = renderToStaticMarkup(
      <CompactDropdown
        value=""
        options={sampleOptions}
        onChange={() => {}}
        placeholder="Select batting style"
        label="Batting Style"
      />
    );

    expect(html).toContain('Batting Style');
    expect(html).toContain('Select batting style');
    expect(html).toContain('Show all options');
    expect(html).toContain('transition-transform');
  });

  it('renders selected option value and badge properly', () => {
    const html = renderToStaticMarkup(
      <CompactDropdown
        value="RHB"
        options={sampleOptions}
        onChange={() => {}}
        label="Batting Hand"
      />
    );

    expect(html).toContain('Right-hand Batsman');
    expect(html).toContain('RHB');
  });

  it('renders custom text input when allowCustomInput is enabled', () => {
    const html = renderToStaticMarkup(
      <CompactDropdown
        value="Tigers XI"
        options={['Tigers XI', 'Lions CC', 'Warriors']}
        onChange={() => {}}
        allowCustomInput
        placeholder="Enter or pick team"
      />
    );

    expect(html).toContain('value="Tigers XI"');
    expect(html).toContain('placeholder="Enter or pick team"');
    expect(html).toContain('Show all options');
  });

  it('supports disabled state with muted styling', () => {
    const html = renderToStaticMarkup(
      <CompactDropdown
        value="RHB"
        options={sampleOptions}
        onChange={() => {}}
        disabled
      />
    );

    expect(html).toContain('opacity-55');
    expect(html).toContain('disabled');
  });
});
