const {
    precisionRound, mapNumberRange, isLegacyEnabled, toLocalISOString, numberWithinRange, hasAlreadyProcessedMessage,
    calibrateAndPrecisionRoundOptions, addActionGroup, postfixWithEndpointName, getKey,
    batteryVoltageToPercentage, getMetaValue,
} = require('zigbee-herdsman-converters/lib/utils');

const utils = require('zigbee-herdsman-converters/lib/utils');
const fz = require('zigbee-herdsman-converters/converters/fromZigbee');
const tz = require('zigbee-herdsman-converters/converters/toZigbee');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const reporting = require('zigbee-herdsman-converters/lib/reporting');
const extend = require('zigbee-herdsman-converters/lib/extend');
const herdsman = require('zigbee-herdsman');
const e = exposes.presets;
const ea = exposes.access;

const fzLocal = {
    plant_watering: {
        cluster: 'genOnOff',
        type: ['attributeReport', 'readResponse'],
        convert: (model, msg, publish, options, meta) => {
            const payload = {};
            if (msg.data.hasOwnProperty('16384')) {
                payload.energy_low = msg.data['16384'] / 1000.0;
            }
            if (msg.data.hasOwnProperty('16385')) {
                payload.energy_high = msg.data['16385'] / 1000.0;
            }
            if (msg.data.hasOwnProperty('16386')) {
                payload.energy_tariff = msg.data['16386'];
            }
            if (msg.data.hasOwnProperty('16387')) {
                payload.power = msg.data['16387'];
            }
            if (msg.data.hasOwnProperty('16388')) {
                payload.power_l1 = msg.data['16388'][2];
                payload.power_l2 = msg.data['16388'][1];
                payload.power_l3 = msg.data['16388'][0];
            }
            if (msg.data.hasOwnProperty('16389')) {
                payload.gas = msg.data['16389'] / 1000.0;
            }
            return payload;
        },
    },
};


const manufacturerOptions = {manufacturerCode: herdsman.Zcl.ManufacturerCode.IKEA_OF_SWEDEN};

const tzLocal = {
    plant_watering: {
        key: ['switch_r1','switch_r2','switch_r3','switch_r4','switch_r5'],
        convertSet: async (entity, key, value, meta) => {
            
            const lookup = {switch_r1: 0x21FD, switch_r2: 0x21FE, switch_r3: 0x21FF, switch_r4: 0x2200, switch_r5: 0x2201};
            const cluster = lookup[key];
            const state = value === 'OFF' ? 1 : 0;
            try {
                const obj = {};
                obj[cluster] = { value: state, type: 16 };
                await entity.write('genOnOff', obj );
            } catch (e) {
                // Fails for some TuYa devices with UNSUPPORTED_ATTRIBUTE, ignore that.
                // e.g. https://github.com/Koenkk/zigbee2mqtt/issues/14857
                if (e.message.includes('UNSUPPORTED_ATTRIBUTE')) {
                } else {
                    throw e;
                }
            }
            const obj2 = {};
            obj2[key] = value
            return {state: obj2};
        },
    },
}

const definition = {
    zigbeeModel: ['LILYGO.Plant_Watering'],
    model: 'LILYGO.Plant_Watering',
    vendor: 'LilyGO',
    description: 'Plant Watering system',
    fromZigbee: [fz.on_off],
    toZigbee: [tzLocal.plant_watering],
    exposes: [
        exposes.switch().withState('switch_r1', true,
        'Water Pump',
        ea.ALL, 'ON', 'OFF'),
        exposes.switch().withState('switch_r2', true,
        'Valve #1',
        ea.ALL, 'ON', 'OFF'),
        exposes.switch().withState('switch_r3', true,
        'Valve #2',
        ea.ALL, 'ON', 'OFF'),
        exposes.switch().withState('switch_r4', true,
        'Valve #3',
        ea.ALL, 'ON', 'OFF'),
        exposes.switch().withState('switch_r5', true,
        'Valve #4',
        ea.ALL, 'ON', 'OFF'),
    ],
    // The configure method below is needed to make the device reports on/off state changes
    // when the device is controlled manually through the button on it.
    
    configure: async (device, coordinatorEndpoint, logger) => {
        //await reporting.bind(device.getEndpoint(1), coordinatorEndpoint, ['genOnOff']);
        //await reporting.bind(device.getEndpoint(2), coordinatorEndpoint, ['genOnOff']);
        const endpoint = device.getEndpoint(1);
        //await bind(endpoint, coordinatorEndpoint, ['genPowerCfg']);
        //await endpoint.configureReporting('genPowerCfg', payload);
        await reporting.bind(endpoint, coordinatorEndpoint, ['genOnOff']);
        await reporting.onOff(endpoint);            
    },
};

module.exports = definition;
