from pathlib import Path
from setuptools import find_packages, setup

BASE_DIR = Path(__file__).parent.resolve()
long_description = (BASE_DIR / "README.md").read_text(encoding="utf-8")
requirements = [
    line.strip()
    for line in (BASE_DIR / "requirements.txt").read_text(encoding="utf-8").splitlines()
    if line.strip() and not line.startswith("#")
]

setup(
    name="lumos",
    version="0.2.0",
    description="Automated multi-user 1-page morning broadsheet printer for the Phomemo M834 thermal printer on Raspberry Pi 3B.",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="Vedant Prajapati",
    python_requires=">=3.9",
    packages=find_packages(include=["lumos", "lumos.*"]),
    py_modules=["generate_and_print", "button_daemon", "executor"],
    install_requires=requirements,
    entry_points={
        "console_scripts": [
            "lumos-print=generate_and_print:main",
            "lumos-button=button_daemon:main",
            "lumos-executor=executor:main",
        ],
    },
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: POSIX :: Linux",
    ],
)
