# Travelers Textures

Utilise your gpu to run [big brain text game.](https://thetravelers.online/)
Also textures

## How to 'install'
Copy paste the goods in out.js into the console

### Keys

| Spacebar       | Focus on the player |
|----------------|---------------------|
| Click and drag | Move camera around  |
| Scroll         | Zoom                |
| T              | Load texture pack   |

## Making a texture pack

Open assets/spritesheet.png in some drawing software.
Draw over the 16x16 sprites with your own.
Upload it while you have the game running with the T key.

## Download test environment

##### Prerequisites

Install [Node](https://nodejs.org/)

##### 1 - Make a folder to put this project in
```
mkdir <folder_name>
cd <folder_name>
```
or just make one however you like.
##### 2 - Clone this repository
```
git clone https://github.com/c-d-t/project_8310823
```
##### 2.5 - Download dependecies
```
npm install
```
##### 3 - Run your development server
```
npm start
```

#### Wont work in your browser?

This uses opengl2 which some browser do not support. (looking at IE and safari here)
Also, not sure if the css looks good on a lot of browser.