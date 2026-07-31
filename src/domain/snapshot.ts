/**
 * Initial frame — transcribed verbatim from docs/BRIEF.md §6.
 *
 * Scenario: the BESS is discharging to support the data-center load. Skid 2 has an
 * elevated-temperature warning and is derated to 1500 kW. Skid 5 is offline (comms lost).
 *
 * The gaps below are INTENTIONAL and must not be filled in:
 *   - SKID-3/4/6 omit ac_voltage_V, ac_current_A and efficiency_pct from `pcs`
 *   - SKID-5 has pcs / battery / transformer all null
 * They are the "missing metrics" and "offline asset" edge cases the brief grades on.
 *
 * Power balance: -(-1984 -1480 -2060 -1912 -1960)/1000 = 9.396 MW discharge;
 *                37.9 - 9.396 = 28.504 ~= the stated grid import of 28.5 MW.
 */

import type { SiteState } from './types';

export const INITIAL_SNAPSHOT: SiteState = {
  stale: false,
  assets: {
    SUBSTATION: {
      state: 'NORMAL',
      metrics: {
        voltage_kV: 138.4,
        frequency_Hz: 60.01,
        power_MW: 28.5,
        power_factor: 0.994,
        main_tx_oil_temp_C: 58,
        main_tx_loading_pct: 57,
      },
      alarms: [],
    },

    'SKID-1': {
      state: 'NORMAL',
      pcs: {
        state: 'NORMAL',
        power_kW: -1984,
        mode: 'DISCHARGE',
        ac_voltage_V: 689,
        ac_current_A: 1673,
        dc_voltage_V: 1330,
        efficiency_pct: 98.2,
        igbt_temp_C: 48,
      },
      battery: {
        state: 'NORMAL',
        soc_pct: 61,
        soh_pct: 97.3,
        dc_bus_V: 1330,
        current_A: 1519,
        power_kW: -2020,
        c_rate: 0.2,
        cell_v_min: 3.181,
        cell_v_avg: 3.198,
        cell_v_max: 3.229,
        cell_temp_min_C: 29.4,
        cell_temp_avg_C: 31.6,
        cell_temp_max_C: 33.8,
        cell_temp_delta_C: 4.4,
        insulation_MOhm: 3.2,
        strings_online: 24,
        envelope: { max_charge_kW: 2500, max_discharge_kW: 2500 },
      },
      transformer: { state: 'NORMAL', temp_C: 63, loading_pct: 79 },
      alarms: [],
    },

    'SKID-2': {
      state: 'WARNING',
      pcs: {
        state: 'NORMAL',
        power_kW: -1480,
        mode: 'DISCHARGE',
        ac_voltage_V: 690,
        ac_current_A: 1247,
        dc_voltage_V: 1333,
        efficiency_pct: 98.1,
        igbt_temp_C: 52,
      },
      battery: {
        state: 'WARNING',
        soc_pct: 58,
        soh_pct: 96.1,
        dc_bus_V: 1333,
        current_A: 1132,
        power_kW: -1509,
        c_rate: 0.15,
        cell_v_min: 3.176,
        cell_v_avg: 3.205,
        cell_v_max: 3.241,
        cell_temp_min_C: 33.1,
        cell_temp_avg_C: 37.8,
        cell_temp_max_C: 41.2,
        cell_temp_delta_C: 8.1,
        insulation_MOhm: 2.7,
        strings_online: 24,
        // Derated: 1000 kW below the 2500 kW nameplate, because a module is at 41.2 C.
        envelope: { max_charge_kW: 2500, max_discharge_kW: 1500 },
      },
      transformer: { state: 'NORMAL', temp_C: 66, loading_pct: 60 },
      alarms: [
        {
          code: 'TEMP_HIGH',
          severity: 'warning',
          message: 'Battery module temperature elevated (max 41.2 C)',
        },
        {
          code: 'TEMP_DELTA',
          severity: 'warning',
          message: 'Cell temperature spread 8.1 C - discharge derated',
        },
      ],
    },

    'SKID-3': {
      state: 'NORMAL',
      // No ac_voltage_V / ac_current_A / efficiency_pct — as given in the brief.
      pcs: {
        state: 'NORMAL',
        power_kW: -2060,
        mode: 'DISCHARGE',
        dc_voltage_V: 1329,
        igbt_temp_C: 49,
      },
      battery: {
        state: 'NORMAL',
        soc_pct: 60,
        soh_pct: 97.6,
        dc_bus_V: 1329,
        current_A: 1578,
        power_kW: -2097,
        c_rate: 0.21,
        cell_v_min: 3.178,
        cell_v_avg: 3.195,
        cell_v_max: 3.224,
        cell_temp_min_C: 28.9,
        cell_temp_avg_C: 31.1,
        cell_temp_max_C: 33.2,
        cell_temp_delta_C: 4.3,
        insulation_MOhm: 3.4,
        strings_online: 24,
        envelope: { max_charge_kW: 2500, max_discharge_kW: 2500 },
      },
      transformer: { state: 'NORMAL', temp_C: 64, loading_pct: 82 },
      alarms: [],
    },

    'SKID-4': {
      state: 'NORMAL',
      // No ac_voltage_V / ac_current_A / efficiency_pct — as given in the brief.
      pcs: {
        state: 'NORMAL',
        power_kW: -1912,
        mode: 'DISCHARGE',
        dc_voltage_V: 1331,
        igbt_temp_C: 47,
      },
      battery: {
        state: 'NORMAL',
        soc_pct: 62,
        soh_pct: 98.0,
        dc_bus_V: 1331,
        current_A: 1464,
        power_kW: -1948,
        c_rate: 0.19,
        cell_v_min: 3.184,
        cell_v_avg: 3.199,
        cell_v_max: 3.226,
        cell_temp_min_C: 27.8,
        cell_temp_avg_C: 30.4,
        cell_temp_max_C: 32.6,
        cell_temp_delta_C: 4.8,
        insulation_MOhm: 3.6,
        strings_online: 24,
        envelope: { max_charge_kW: 2500, max_discharge_kW: 2500 },
      },
      transformer: { state: 'NORMAL', temp_C: 61, loading_pct: 76 },
      alarms: [],
    },

    // Offline: no telemetry at all. The detail panel must still open and explain the absence.
    'SKID-5': {
      state: 'OFFLINE',
      pcs: null,
      battery: null,
      transformer: null,
      alarms: [
        {
          code: 'COMMS_LOST',
          severity: 'critical',
          message: 'No telemetry received from skid',
        },
      ],
    },

    'SKID-6': {
      state: 'NORMAL',
      // No ac_voltage_V / ac_current_A / efficiency_pct — as given in the brief.
      pcs: {
        state: 'NORMAL',
        power_kW: -1960,
        mode: 'DISCHARGE',
        dc_voltage_V: 1332,
        igbt_temp_C: 48,
      },
      battery: {
        state: 'NORMAL',
        soc_pct: 59,
        soh_pct: 97.1,
        dc_bus_V: 1332,
        current_A: 1500,
        power_kW: -1998,
        c_rate: 0.2,
        cell_v_min: 3.18,
        cell_v_avg: 3.202,
        cell_v_max: 3.231,
        cell_temp_min_C: 29.0,
        cell_temp_avg_C: 31.9,
        cell_temp_max_C: 34.1,
        cell_temp_delta_C: 5.1,
        insulation_MOhm: 3.1,
        strings_online: 24,
        envelope: { max_charge_kW: 2500, max_discharge_kW: 2500 },
      },
      transformer: { state: 'NORMAL', temp_C: 62, loading_pct: 78 },
      alarms: [],
    },

    LOAD: {
      state: 'NORMAL',
      metrics: { power_MW: 37.9, it_load_MW: 28.5, pue: 1.33, voltage_kV: 34.5 },
      alarms: [],
    },
  },
};
