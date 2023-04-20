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
        key: ['state'],
        convertSet: async (entity, key, value, meta) => {
            const lookup = {l1: 1, l2: 2, l3: 3, l4: 4, l5: 5, l6: 6};
            const keyid = multiEndpoint ? lookup[meta.endpoint_name] : 1;
            const payloads = {
                switch_type: {
                    switchType,
                },
                switch_actions: {
                    switchActions,
                },
            };

            await entity.write('genOnOffSwitchCfg', payloads[key]);
        },
    },
    on_off: {
        key: ['state','switch_r1', 'switch_r2','on_time', 'off_wait_time'],
        convertSet: async (entity, key, value, meta) => {
            if(key == "switch_r1") 
            {
                const state = value === 'OFF' ? 1 : 0
                //if(value == "ON") {state = 1}
                //await entity.command('genOnOff', state, {}, utils.getOptions(meta.mapped, entity));
                //await entity.write('genOnOff', {0x10: {value: 0x10, type: 0x10}});    
                try {
                    await entity.write('genOnOff', {0x21FD: {value: state, type: 16}});
                } catch (e) {
                    // Fails for some TuYa devices with UNSUPPORTED_ATTRIBUTE, ignore that.
                    // e.g. https://github.com/Koenkk/zigbee2mqtt/issues/14857
                    if (e.message.includes('UNSUPPORTED_ATTRIBUTE')) {
                    } else {
                        throw e;
                    }
                }
                return {state: {switch_r1: value}};
                //await entity.write('genTime', {time: 25});                
                //const payload = {ctrlbits: 0, ontime: 25, offwaittime: 15};
                //await entity.command('genOnOff', 'onWithTimedOff', payload, utils.getOptions(meta.mapped, entity));
            }
            if(key == "switch_r2") 
            {
                const state = value === 'OFF' ? 2 : 65
                //if(value == "ON") {state = 1}
                await entity.command('genOnOff', state, {}, utils.getOptions(meta.mapped, entity));
            }
            return {state: {switch_r1: 1}};
            throw Error('The on_time value must be a number! ' + value);
            const state = meta.message.hasOwnProperty('switch_r1') ? meta.message.state.toLowerCase() : null;
            utils.validateValue(state, ['toggle', 'off', 'on']);

            if (state === 'on' && (meta.message.hasOwnProperty('on_time') || meta.message.hasOwnProperty('off_wait_time'))) {
                const onTime = meta.message.hasOwnProperty('on_time') ? meta.message.on_time : 0;
                const offWaitTime = meta.message.hasOwnProperty('off_wait_time') ? meta.message.off_wait_time : 0;

                if (typeof onTime !== 'number') {
                    throw Error('The on_time value must be a number!');
                }
                if (typeof offWaitTime !== 'number') {
                    throw Error('The off_wait_time value must be a number!');
                }

                const payload = {ctrlbits: 0, ontime: Math.round(onTime * 10), offwaittime: Math.round(offWaitTime * 10)};
                await entity.command('genOnOff', 'onWithTimedOff', payload, utils.getOptions(meta.mapped, entity));
            } else {
                await entity.command('genOnOff', 2, {}, utils.getOptions(meta.mapped, entity));
                if (state === 'toggle') {
                    const currentState = meta.state[`state${meta.endpoint_name ? `_${meta.endpoint_name}` : ''}`];
                    return currentState ? {state: {state: currentState === 'OFF' ? 'ON' : 'OFF'}} : {};
                } else {
                    return {state: {state: 2}};
                }
            }
        },
        convertGet: async (entity, key, meta) => {
            await entity.read('genOnOff', ['onOff']);
        },
    },
}

const definition = {
    zigbeeModel: ['LILYGO.Plant_Watering'],
    model: 'LILYGO.Plant_Watering',
    vendor: 'LilyGO',
    description: 'Plant Watering system',
    fromZigbee: [fz.on_off],
    toZigbee: [tzLocal.on_off],
    exposes: [
        //exposes.switch('energy_low', ea.STATE).withUnit('kWh').withDescription('Energy low tariff'),
        exposes.switch().withState('switch_r1', true,
        'Relay #1',
        ea.ALL, 'ON', 'OFF'),
        exposes.switch().withState('switch_r2', true,
        'Relay #2',
        ea.ALL, 'ON', 'OFF'),
        exposes.switch().withState('switch_r3', true,
        'Relay #3',
        ea.ALL, 'ON', 'OFF'),
        exposes.switch().withState('switch_r4', true,
        'Relay #4',
        ea.ALL, 'ON', 'OFF'),
        exposes.switch().withState('switch_r5', true,
        'Relay #5',
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
