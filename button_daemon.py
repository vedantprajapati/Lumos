#!/usr/bin/env python3
import time
from gpiozero import Button
from generate_and_print import print_briefing

BUTTON_PIN = 17  # GPIO 17 (Physical Pin 11)

def on_pressed():
    print("Physical button pressed! Generating and printing daily brief...")
    try:
        print_briefing(custom_note="Dispatched via Lumos hardware push button.")
    except Exception as e:
        print(f"Print job failed: {e}")

def main():
    btn = Button(BUTTON_PIN, pull_up=True, bounce_time=0.3)
    btn.when_pressed = on_pressed
    print(f"Lumos button daemon active on GPIO {BUTTON_PIN}. Awaiting input...")
    while True:
        time.sleep(1)

if __name__ == "__main__":
    main()
