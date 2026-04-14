/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';
import type { Archetype, StaticEntity } from 'carrier-contracts/types';
import { renderToStaticMarkup } from 'react-dom/server';

import { createZarchEntityEditState } from './zarch-entity-edit';
import {
  ZarchEntityEditHud,
  getCommittedEntityYOffset
} from './zarch-entity-edit-hud';

const archetype: Archetype = {
  assetVersionId: 'watchtower-v1',
  category: 'building',
  createdAt: '2026-03-24T00:00:00.000Z',
  id: 'watchtower',
  name: 'Watchtower',
  status: 'active',
  tags: [],
  updatedAt: '2026-03-24T00:00:00.000Z'
};

const selectedEntity: StaticEntity = {
  archetypeId: archetype.id,
  createdAt: '2026-03-24T00:00:00.000Z',
  id: 'watchtower-1',
  label: 'North Tower',
  mapId: 'map-1',
  position: { x: 10, z: 12 },
  rotation: { yaw: 45 },
  scale: 1,
  state: 'active',
  updatedAt: '2026-03-24T00:00:00.000Z',
  yOffset: 2.5
};

const noop = () => {};

describe('zarch entity edit HUD', () => {
  test('renders the selected entity height offset input', () => {
    const entityEditState = {
      ...createZarchEntityEditState(),
      selectedEntityId: selectedEntity.id,
      tool: 'select' as const
    };

    const html = renderToStaticMarkup(
      <ZarchEntityEditHud
        archetypes={[archetype]}
        editEnabled
        editorMode="entities"
        entityEditState={entityEditState}
        onCatalogToggle={noop}
        onDeleteEntity={noop}
        onRotateEntity={noop}
        onSetEditorMode={noop}
        onSetEnabled={noop}
        onSetEntityYOffset={noop}
        onSetTool={noop}
        selectedEntity={selectedEntity}
      />
    );

    expect(html).toContain('Height Offset');
    expect(html).toContain('value="2.5"');
    expect(html).toContain('Offset: 2.5m');
  });

  test('accepts only finite changed height offsets for commit', () => {
    expect(
      getCommittedEntityYOffset({ currentYOffset: 2.5, value: '3.25' })
    ).toBe(3.25);
    expect(
      getCommittedEntityYOffset({ currentYOffset: 2.5, value: '2.5' })
    ).toBeNull();
    expect(
      getCommittedEntityYOffset({ currentYOffset: 2.5, value: '' })
    ).toBeNull();
    expect(
      getCommittedEntityYOffset({ currentYOffset: 2.5, value: 'nope' })
    ).toBeNull();
  });
});
