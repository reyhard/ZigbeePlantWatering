/*
 *  This sketch sends data via HTTP GET requests to data.sparkfun.com service.
 *
 *  You need to get streamId and privateKey at data.sparkfun.com and paste them
 *  below. Or just customize this script to talk to other HTTP servers.
 *
 */

#include <Arduino.h>
#include <zbhci.h>
#include <hci_display.h>
#include <OneButton.h>
#include "esp_task_wdt.h"

#define CONFIG_ZIGBEE_MODULE_PIN 0
#define CONFIG_USR_BUTTON_PIN 2
#define CONFIG_BLUE_LIGHT_PIN 3
//#define CONFIG_LED_1_LIGHT_PIN 8

#define PIN_RELAY_1 4
#define PIN_RELAY_2 5
#define PIN_RELAY_3 6
#define PIN_RELAY_4 7
#define PIN_RELAY_5 8

#define ZCL_RELAY_1 0x21FD
#define ZCL_RELAY_2 0x21FE
#define ZCL_RELAY_3 0x21FF
#define ZCL_RELAY_4 0x2200
#define ZCL_RELAY_5 0x2201
const uint8_t au8ManufacturerName[] = {21,'L','I','L','Y','G','O', '.', 'P', 'l', 'a', 'n', 't','_','W','a','t','e','r','i','n','g'};

QueueHandle_t msg_queue;

/**
 * Initialize a new OneButton instance for a button
 * connected to digital pin 4 and GND, which is active low
 * and uses the internal pull-up resistor.
 */
OneButton btn = OneButton(CONFIG_USR_BUTTON_PIN,     // Input pin for the button
                          true,  // Button is active LOW
                          true); // Enable internal pull-up resistor

void setup()
{
    Serial.begin(115200);
    delay(10);
    Serial.printf("Init Light\n");

    pinMode(CONFIG_ZIGBEE_MODULE_PIN, OUTPUT);
    digitalWrite(CONFIG_ZIGBEE_MODULE_PIN, HIGH);
    delay(500);

    pinMode(CONFIG_BLUE_LIGHT_PIN, OUTPUT);
    digitalWrite(CONFIG_BLUE_LIGHT_PIN, LOW);

    pinMode(PIN_RELAY_1, OUTPUT);
    pinMode(PIN_RELAY_2, OUTPUT);
    pinMode(PIN_RELAY_3, OUTPUT);
    pinMode(PIN_RELAY_4, OUTPUT);
    pinMode(PIN_RELAY_5, OUTPUT);


    btn.attachClick(handleClick);
    btn.setPressTicks(3000);
    btn.attachLongPressStart(handleLongPress);

    msg_queue = xQueueCreate(10, sizeof(ts_HciMsg));
    zbhci_Init(msg_queue);

    xTaskCreatePinnedToCore(
        zbhciTask,
        "zbhci",   // A name just for humans
        4096,          // This stack size can be checked & adjusted by reading the Stack Highwater
        NULL,
        5,             // Priority, with 3 (configMAX_PRIORITIES - 1) being the highest, and 0 being the lowest.
        NULL ,
        ARDUINO_RUNNING_CORE);

    // zbhci_BdbFactoryReset();
    delay(100);
    zbhci_NetworkStateReq();
}


void loop()
{
    btn.tick();
}

uint8_t ledState = 0;
uint8_t netState = 0;

void handleClick(void)
{
    ts_DstAddr sDstAddr;

    ledState = !ledState;
    sDstAddr.u16DstAddr = 0x0000;
    if (netState == 1)
    {
        zbhci_ZclSendReportCmd(0x02, sDstAddr, 1, 1, 0, 1, 0x0006, 0x0000, ZCL_DATA_TYPE_BOOLEAN, 1, &ledState);
        delay(100);
    }
    else
    {
        Serial.println("Not joined the zigbee network");
    }

    digitalWrite(CONFIG_BLUE_LIGHT_PIN, ledState);
}


void handleLongPress()
{
    if (netState == 0)
    {
        Serial.println("Joining the zigbee network");
        zbhci_BdbCommissionSteer();
        vTaskDelay(100 / portTICK_PERIOD_MS);
    }
    else if (netState == 1)
    {
        Serial.println("leave the zigbee network");
        zbhci_BdbFactoryReset();
        vTaskDelay(1000 / portTICK_PERIOD_MS);
        netState = 0;
    }
}


void zbhciTask(void *pvParameters)
{
    ts_HciMsg sHciMsg;
    ts_DstAddr sDstAddr;
    u_int8_t desired_state;

    while (1)
    {
        bzero(&sHciMsg, sizeof(sHciMsg));
        Serial.print("Message received\n");
        if (xQueueReceive(msg_queue, &sHciMsg, portMAX_DELAY))
        {
            switch (sHciMsg.u16MsgType)
            {
                case ZBHCI_CMD_ACKNOWLEDGE:
                    // displayAcknowledg(&sHciMsg.uPayload.sAckPayload);
                break;

                case ZBHCI_CMD_NETWORK_STATE_RSP:
                    if (sHciMsg.uPayload.sNetworkStateRspPayloasd.u16NwkAddr == 0x0000)
                    {
                        zbhci_BdbFactoryReset();
                        vTaskDelay(1000 / portTICK_PERIOD_MS);
                        zbhci_NetworkStateReq();
                    }
                    else if (sHciMsg.uPayload.sNetworkStateRspPayloasd.u16NwkAddr != 0xFFFF)
                    {
                        netState = 1;
                    }
                break;

                case ZBHCI_CMD_NETWORK_STATE_REPORT:
                    netState = 1;
                    sDstAddr.u16DstAddr = 0x0000;
                    zbhci_ZclSendReportCmd(0x02, sDstAddr, 1, 1, 0, 1, 0x0000, 0x0005, ZCL_DATA_TYPE_CHAR_STR, sizeof(au8ManufacturerName), (uint8_t *)&au8ManufacturerName);
                break;

                case ZBHCI_CMD_ZCL_ONOFF_CMD_RCV:
                    if (sHciMsg.uPayload.sZclOnOffCmdRcvPayload.u8CmdId == 0)
                    {
                        digitalWrite(CONFIG_BLUE_LIGHT_PIN, LOW);
                        ledState = 0;
                    }
                    else if (sHciMsg.uPayload.sZclOnOffCmdRcvPayload.u8CmdId == 1)
                    {
                        digitalWrite(CONFIG_BLUE_LIGHT_PIN, HIGH);
                        ledState = 1;
                    }
                    else if (sHciMsg.uPayload.sZclOnOffCmdRcvPayload.u8CmdId == 2)
                    {
                        ledState = !ledState;
                        digitalWrite(CONFIG_BLUE_LIGHT_PIN, ledState);
                    }
                    Serial.printf("u16MsgType %d\n %d\n", sHciMsg.uPayload.sZclOnOffCmdRcvPayload.u8CmdId, sHciMsg.uPayload.sZclOnOffCmdRcvPayload.u16ClusterId);
                    zbhci_ZclSendReportCmd(0x02, sDstAddr, 1, 1, 0, 1, 0x0006, 0x0000, ZCL_DATA_TYPE_BOOLEAN, 1, &ledState);
                break;

                case ZBHCI_CMD_ZCL_ATTR_WRITE_RCV:
                    Serial.printf("Cluster %d %d\n",sHciMsg.uPayload.sZclAttrWriteRspPayload.u16ClusterId,sHciMsg.uPayload.sZclAttrWriteRspPayload.u8SeqNum);
                    desired_state = (sHciMsg.uPayload.sZclAttrWriteRspPayload.asAttrWriteList[0].u8Status == 0 ? HIGH : LOW);
                    switch(sHciMsg.uPayload.sZclAttrWriteRspPayload.asAttrWriteList[0].u16AttrID)
                    {
                        case ZCL_RELAY_1:
                        {
                            digitalWrite(CONFIG_BLUE_LIGHT_PIN, desired_state);
                            digitalWrite(PIN_RELAY_1, desired_state);
                            Serial.printf("activated pin 1 \n");
                        }
                        break;
                        case ZCL_RELAY_2:
                        {
                            digitalWrite(CONFIG_BLUE_LIGHT_PIN, desired_state);
                            digitalWrite(PIN_RELAY_2, desired_state);
                            Serial.printf("activated pin 2 \n");
                        }
                        break;
                        case ZCL_RELAY_3:
                        {
                            digitalWrite(CONFIG_BLUE_LIGHT_PIN, desired_state);
                            digitalWrite(PIN_RELAY_3, desired_state);
                            Serial.printf("activated pin 3 \n");
                        }
                        break;
                        case ZCL_RELAY_4:
                        {
                            digitalWrite(CONFIG_BLUE_LIGHT_PIN, desired_state);
                            digitalWrite(PIN_RELAY_4, desired_state);
                            Serial.printf("activated pin 4 \n");
                            
                        }
                        break;
                        case ZCL_RELAY_5:
                        {
                            digitalWrite(CONFIG_BLUE_LIGHT_PIN, desired_state);
                            digitalWrite(PIN_RELAY_5, desired_state);
                            Serial.printf("activated pin 5 \n");
                        }
                        break;
                        default:
                            Serial.printf("other msg type u16MsgType %d\n", sHciMsg.u16MsgType);
                        break;
                    }
                    Serial.printf("Write %d\n %d\n", sHciMsg.uPayload.sZclAttrWriteRspPayload.asAttrWriteList[0].u8Status, sHciMsg.uPayload.sZclAttrWriteRspPayload.asAttrWriteList[0].u16AttrID);
                break;

                default:
                    Serial.printf("other msg type u16MsgType %d\n", sHciMsg.u16MsgType);
                break;
            }
        }
        vTaskDelay(100 / portTICK_PERIOD_MS);
    }
}
