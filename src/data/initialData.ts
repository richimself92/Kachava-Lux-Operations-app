import type { PropertyLocation } from '../types';

/**
 * Property Locations:
 * 1. Eight Villas (official operational sequence):
 *    Villa 102, Villa 104, Villa 106, Villa 108, Villa 101, Villa 103, Villa 105, Villa 107
 * 2. Facilities (codes and order mirror shared/domain.ts LOCATIONS):
 *    Management Office, Warehouse Office, Kitchen, Gym, Storage, Storeroom (Bodega)
 */
export const INITIAL_LOCATIONS: PropertyLocation[] = [
  // Villas
  {
    id: 'loc-102',
    code: '102',
    name: 'Villa 102',
    type: 'villa',
    bedrooms: 3,
    bathrooms: 3.5,
    isActive: true,
  },
  {
    id: 'loc-104',
    code: '104',
    name: 'Villa 104',
    type: 'villa',
    bedrooms: 3,
    bathrooms: 3.5,
    isActive: true,
  },
  {
    id: 'loc-106',
    code: '106',
    name: 'Villa 106',
    type: 'villa',
    bedrooms: 3,
    bathrooms: 3.5,
    isActive: true,
  },
  {
    id: 'loc-108',
    code: '108',
    name: 'Villa 108',
    type: 'villa',
    bedrooms: 3,
    bathrooms: 3.5,
    isActive: true,
  },
  {
    id: 'loc-101',
    code: '101',
    name: 'Villa 101',
    type: 'villa',
    bedrooms: 2,
    bathrooms: 2,
    isActive: true,
  },
  {
    id: 'loc-103',
    code: '103',
    name: 'Villa 103',
    type: 'villa',
    bedrooms: 3,
    bathrooms: 3.5,
    isActive: true,
  },
  {
    id: 'loc-105',
    code: '105',
    name: 'Villa 105',
    type: 'villa',
    bedrooms: 3,
    bathrooms: 3.5,
    isActive: true,
  },
  {
    id: 'loc-107',
    code: '107',
    name: 'Villa 107',
    type: 'villa',
    bedrooms: 3,
    bathrooms: 3.5,
    isActive: true,
  },
  // Other Property Locations
  {
    id: 'loc-office',
    code: 'office',
    name: 'Management Office',
    type: 'facility',
    isActive: true,
  },
  {
    id: 'loc-warehouse_office',
    code: 'warehouse_office',
    name: 'Warehouse Office',
    type: 'facility',
    isActive: true,
  },
  {
    id: 'loc-kitchen',
    code: 'kitchen',
    name: 'Kitchen',
    type: 'facility',
    isActive: true,
  },
  {
    id: 'loc-gym',
    code: 'gym',
    name: 'Gym',
    type: 'facility',
    isActive: true,
  },
  {
    id: 'loc-storage',
    code: 'storage',
    name: 'Storage',
    type: 'facility',
    isActive: true,
  },
  {
    id: 'loc-bodega',
    code: 'bodega',
    name: 'Storeroom',
    type: 'facility',
    isActive: true,
  },
];

export const INITIAL_RESIDENCES = INITIAL_LOCATIONS;
