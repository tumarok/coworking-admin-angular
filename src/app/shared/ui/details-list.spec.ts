import { Component } from '@angular/core';
import { render, screen, within } from '@testing-library/angular';
import { type DetailsField, DetailsList } from './details-list';
import { DetailsValue } from './details-value';

interface Room {
  city: string;
  seats: number;
  company: string | null;
  note: string;
}

const ROOM: Room = { city: 'Kyiv', seats: 0, company: null, note: '' };

@Component({
  imports: [DetailsList, DetailsValue],
  template: `
    <app-details-list [record]="room" [fields]="fields">
      <ng-template appDetailValue="link" let-room
        ><a href="/rooms">Rooms in {{ room.city }}</a></ng-template
      >
    </app-details-list>
  `,
})
class Host {
  readonly room = ROOM;
  readonly fields: DetailsField<Room>[] = [
    { key: 'city', label: 'City', value: (r) => r.city },
    { key: 'seats', label: 'Seats', value: (r) => r.seats },
    { key: 'company', label: 'Company', value: (r) => r.company },
    { key: 'note', label: 'Note', value: (r) => r.note },
    { key: 'missing', label: 'Missing' },
    { key: 'link', label: 'Rooms link' },
  ];
}

describe('DetailsList', () => {
  const valueOf = (label: string) => {
    const term = screen.getByText(label, { selector: 'dt' });
    return term.nextElementSibling as HTMLElement;
  };

  it('pairs each label with the value its field reads from the record', async () => {
    await render(Host);

    expect(valueOf('City')).toHaveTextContent('Kyiv');
    expect(valueOf('Seats')).toHaveTextContent('0');
  });

  it('shows a dash where a value is missing, empty or null, but not for zero', async () => {
    await render(Host);

    for (const label of ['Company', 'Note', 'Missing']) {
      expect(valueOf(label)).toHaveTextContent('—');
    }
    expect(valueOf('Seats')).not.toHaveTextContent('—');
  });

  it('draws a custom value in place of the text, with the record to read from', async () => {
    await render(Host);

    const link = within(valueOf('Rooms link')).getByRole('link', { name: 'Rooms in Kyiv' });
    expect(link).toHaveAttribute('href', '/rooms');
    expect(valueOf('Rooms link')).not.toHaveTextContent('—');
  });

  it('is a description list', async () => {
    const { container } = await render(Host);

    expect(container.querySelectorAll('dl > div > dt')).toHaveLength(6);
  });
});
