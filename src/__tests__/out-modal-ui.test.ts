import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OutModal } from '../components/modals/OutModal';

describe('OutModal — UI Rendering & Config Flow Verification', () => {
  it('renders single-batter dismissal (Bowled): auto-selects striker and hides Who is Out selector', () => {
    const html = renderToStaticMarkup(
      React.createElement(OutModal, {
        isOpen: true,
        onClose: () => {},
        onConfirm: () => {},
        strikerName: 'Tamim Iqbal',
        nonStrikerName: 'Litton Das',
        bowlerName: 'Jasprit Bumrah',
        initialDismissalType: 'Bowled',
      })
    );

    expect(html).toContain('Record Wicket');
    expect(html).toContain('Bowled');
    // Auto-selected striker summary
    expect(html).toContain('Tamim Iqbal (Auto-selected)');
    // Must NOT contain the manual "Who is Out?" prompt
    expect(html).not.toContain('Who is Out?');
    // Must NOT contain fielder input for Bowled
    expect(html).not.toContain('Fielder Name');
  });

  it('renders Caught dismissal: auto-selects striker and includes Fielder input', () => {
    const html = renderToStaticMarkup(
      React.createElement(OutModal, {
        isOpen: true,
        onClose: () => {},
        onConfirm: () => {},
        strikerName: 'Tamim Iqbal',
        nonStrikerName: 'Litton Das',
        bowlerName: 'Jasprit Bumrah',
        initialDismissalType: 'Caught',
      })
    );

    expect(html).toContain('Caught');
    expect(html).toContain('Tamim Iqbal (Auto-selected)');
    expect(html).not.toContain('Who is Out?');
    // Caught requires a fielder
    expect(html).toContain('Fielder / Keeper');
  });

  it('renders multi-batter dismissal (Run Out): displays compact Who is Out selector', () => {
    const html = renderToStaticMarkup(
      React.createElement(OutModal, {
        isOpen: true,
        onClose: () => {},
        onConfirm: () => {},
        strikerName: 'Tamim Iqbal',
        nonStrikerName: 'Litton Das',
        bowlerName: 'Jasprit Bumrah',
        initialDismissalType: 'Run Out',
      })
    );

    expect(html).toContain('Run Out');
    // Must contain compact batter selector
    expect(html).toContain('Who is Out?');
    expect(html).toContain('Striker');
    expect(html).toContain('Non-Striker');
    expect(html).toContain('Tamim Iqbal');
    expect(html).toContain('Litton Das');
    // Fielder input included
    expect(html).toContain('Fielder (Throw / Assist)');
    // Runs completed on ball selector included
    expect(html).toContain('Runs Completed on this Ball');
  });

  it('renders Hit the Ball Twice: auto-selects striker and does not show fielder input', () => {
    const html = renderToStaticMarkup(
      React.createElement(OutModal, {
        isOpen: true,
        onClose: () => {},
        onConfirm: () => {},
        strikerName: 'Tamim Iqbal',
        nonStrikerName: 'Litton Das',
        initialDismissalType: 'Hit the Ball Twice',
      })
    );

    expect(html).toContain('Hit the Ball Twice');
    expect(html).toContain('Tamim Iqbal (Auto-selected)');
    expect(html).not.toContain('Who is Out?');
    expect(html).not.toContain('Fielder');
  });

  it('renders Obstructing the Field: displays compact batter selector and hides fielder input', () => {
    const html = renderToStaticMarkup(
      React.createElement(OutModal, {
        isOpen: true,
        onClose: () => {},
        onConfirm: () => {},
        strikerName: 'Tamim Iqbal',
        nonStrikerName: 'Litton Das',
        initialDismissalType: 'Obstructing the Field',
      })
    );

    expect(html).toContain('Obstructing the Field');
    expect(html).toContain('Who is Out?');
    expect(html).not.toContain('Fielder');
  });

  it('handles last wicket: shows All Out notice and hides incoming batter input', () => {
    const html = renderToStaticMarkup(
      React.createElement(OutModal, {
        isOpen: true,
        onClose: () => {},
        onConfirm: () => {},
        strikerName: 'Tamim Iqbal',
        nonStrikerName: 'Litton Das',
        initialDismissalType: 'Bowled',
        isLastWicket: true,
      })
    );

    expect(html).toContain('All Out');
    expect(html).toContain('Last wicket of innings');
    expect(html).not.toContain('placeholder="Next Batsman"');
  });

  it('does not render anything when isOpen is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(OutModal, {
        isOpen: false,
        onClose: () => {},
        onConfirm: () => {},
      })
    );

    expect(html).toBe('');
  });
});
