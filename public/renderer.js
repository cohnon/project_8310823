/**
 * @author: Chris Tangles
 * 
 * TODO: 
 * Move a lot of the logic like zoom levels to the shaders
 * sprite class that allows different resolutions and reads from json
 * Dynamic tilemap class
 * Chunk system
 * https://www.reddit.com/r/Unity2D/comments/ccilln/zooming_out_over_a_giant_tile_map_with_no/
 * animated sprites
 * camera class
 * some kind of 'library' of texture packs
 * lighting syste
 * tile select and a* click to move
 */


class Renderer
{
    constructor(spritesheetSrc)
    {
        this.width;
        this.height;
        this.currentPosition = 0;
        this.scale = 2;
        this.offsetX = 0;
        this.offsetY = 0;
        this.keydown = false;

        this.vbo;
        this.vao;
        this.ebo;

        this.maxQuads = 128*128;
        this.maxVertices;
        this.vertices;
        this.indices;
        this.spriteCount = 0;
        this.vertexPtr = 0;
        this.indexPtr = 0;

        this.focusedOnPlayer = true;
        this.lastTime;
        this.d_t;

        this.running = false;

        // download spritesheet before finished initialization
        this.spritesheet = new Image();
        this.spritesheet.crossOrigin = '';
        this.spritesheet.src = spritesheetSrc;
        this.spritesheet.addEventListener('load', () => {
            if (this.running)
            {
                this.setTexture(this.spritesheet);
                return;
            }
            this.running = true;
            this.merge();
            this.initWebGl();
            this.initEvents();
            this.start();
            requestAnimationFrame(t => this.update(t));
        });
    }

    /**
     * Modifies the original travelersmmo source to fit nice and snug with my garbage
     */
    merge()
    {
        const style=document.createElement('style');
        if(style.styleSheet){
            style.styleSheet.cssText=stylesSource;
        }else{
            style.appendChild(document.createTextNode(stylesSource));
        }
        document.getElementsByTagName('head')[0].appendChild(style);

        // brutally rip out the function that receives socket data so i can add my own stuff to it
        // because for some reason open doors have no way of being detected other than from the source
        this.openedDoors = [];
        const oldFunc = ENGINE.applyData;
        const newFunc = (json, midCycleDataCall) => {
            oldFunc(json, midCycleDataCall);

            this.openedDoors = json.doors;
        }
        ENGINE.applyData = newFunc;
    }

    /**
     * Boring WebGl initialization
     * TODO: Check if browser can handle the raw power of webgl2 and use that
     */
    initWebGl()
    {
        // Sets up the actual rendering screen
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'canvas';
        this.parent = document.getElementsByClassName('mid-screencontainer')[0];
        this.parent.insertBefore(this.canvas, null);
        this.webGl = this.canvas.getContext('webgl2');

        // Just a quick and dirty check against the plebs
        if (this.webGl === null)
        {
            alert('sorry bub, but you should start using a modern browser...');
            return;
        }

        this.resize();

        // Sets up a super simple shader that draws a textured quad (shader source is at the bottom of this file)
        this.shader = new Shader(this.webGl);
        this.shader.compile(vertexShaderSource, fragmentShaderSource);

        if (!this.shader.compiled)
        {
            alert('uh oh, spaghetti ohs. i suck at writing shaders');
            return;
        }

        this.setTexture(this.spritesheet);


         /**********************/
        /** DATA SENT TO GPU **/
        // Sets up all the buffers we will need on the GPU
        // PS: Since every draw call will be using the same vbo and ebo. I wont be using vaos... yet 

        
        // Create the vertex buffer object
        const floatsPerVertex = 4;
        const verticesPerQuad = 4;
        this.maxVertices = this.maxQuads * verticesPerQuad * floatsPerVertex;
        
        this.vertices = new Float32Array(this.maxVertices);
        this.vbo = this.webGl.createBuffer();
        this.webGl.bindBuffer(this.webGl.ARRAY_BUFFER, this.vbo);
        this.webGl.bufferData(this.webGl.ARRAY_BUFFER, this.vertices, this.webGl.DYNAMIC_DRAW);


        // Create the element buffer object (indicies)
        const indicesPerQuad = 6;
        const indexSize = this.maxQuads * indicesPerQuad;

        this.indices = generateIndices(indexSize);
        this.ebo = this.webGl.createBuffer();
        this.webGl.bindBuffer(this.webGl.ELEMENT_ARRAY_BUFFER, this.ebo)
        this.webGl.bufferData(this.webGl.ELEMENT_ARRAY_BUFFER, this.indices, this.webGl.DYNAMIC_DRAW);


         /*****************/
        /** STATE SETUP **/
        // Tells WebGl what buffer objects we're using (those ones ^) 
        // !!! All this stuff should be done in a loop of some sort before every draw call but since I never have to change the state, I don't have to follow any standards B)

        this.webGl.useProgram(this.shader.programId);

        this.webGl.enableVertexAttribArray(this.shader.getAttribute('a_position'));
        this.webGl.bindBuffer(this.webGl.ARRAY_BUFFER, this.vbo);
        this.webGl.vertexAttribPointer(
            this.shader.getAttribute('a_position'),
            2,
            this.webGl.FLOAT,
            false,
            4 * 4,
            0,
        );
        this.webGl.enableVertexAttribArray(this.shader.getAttribute('a_texcoord'));
        this.webGl.vertexAttribPointer(
            this.shader.getAttribute('a_texcoord'),
            2,
            this.webGl.FLOAT,
            false,
            4 * 4,
            2 * 4,
        );
        this.webGl.bindBuffer(this.webGl.ELEMENT_ARRAY_BUFFER, this.ebo);

        this.webGl.uniform1i(this.shader.getUniform('u_texture'), 0);
    }

    setTexture(image)
    {
        // Setup texture

        if (!this.textureId)
        {
            this.textureId = this.webGl.createTexture();
            this.webGl.bindTexture(this.webGl.TEXTURE_2D, this.textureId);
            this.webGl.texParameteri(this.webGl.TEXTURE_2D, this.webGl.TEXTURE_MIN_FILTER, this.webGl.NEAREST_MIPMAP_NEAREST);
            this.webGl.texParameteri(this.webGl.TEXTURE_2D, this.webGl.TEXTURE_MIN_FILTER, this.webGl.NEAREST);
            this.webGl.texParameteri(this.webGl.TEXTURE_2D, this.webGl.TEXTURE_MAG_FILTER, this.webGl.NEAREST);
            this.webGl.blendFunc(this.webGl.SRC_ALPHA, this.webGl.ONE_MINUS_SRC_ALPHA);
            this.webGl.enable(this.webGl.BLEND);
        }
        // this.webGl.bindTexture(this.webGl.TEXTURE_2D, this.textureId);
        this.webGl.texImage2D(this.webGl.TEXTURE_2D, 0, this.webGl.RGBA, this.webGl.RGBA, this.webGl.UNSIGNED_BYTE, image);
    }

    initEvents()
    {
        this.canvas.addEventListener('mousedown', e => this.mouseupdown(e));
        addEventListener('mouseup', e => this.mouseupdown(e));
        addEventListener('mousemove', e => this.mousemove(e));
        addEventListener('resize', e => this.resize(e));
        this.canvas.addEventListener('wheel', e => this.scroll(e));

        this.imgHTML = document.createElement('input');
        this.imgHTML.style.display = 'none';
        this.imgHTML.type = 'file';
        this.imgHTML.accept = 'image/*';
        document.getElementsByTagName('body')[0].appendChild(this.imgHTML);
        this.imgHTML.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!this.reader)
            {
                this.reader = new FileReader();
                this.reader.onload = (e) => {
                    this.spritesheet.src = e.target.result;
                }
            }
    
            
            this.reader.readAsDataURL(file); // convert to base64 string
        });

        addEventListener('keydown', e => {
            if (YOU.state === 'int')
            {
                return;
            }
            if (e.key === ' ')
            {
                e.preventDefault();
                this.focusedOnPlayer = true;
                this.curX = YOU.x;
                this.curY = YOU.y;
                this.scale = 2;
            }
            else if (e.key === 't')
            {
                this.imgHTML.style.display = 'block';
                this.imgHTML.click();
                this.imgHTML.style.display = 'none';
            }
        });
       
    }

    start()
    {
        // moves ''''''''camera''''''''''' to player
        this.moveCamera(YOU.x, YOU.y);
        this.curX = YOU.x;
        this.curY = YOU.y;
    }

    update(t)
    {
        this.d_t = this.lastTime ? (t - this.lastTime) : 0;
        this.lastTime = t;

        // console.log("FPS" + (1000 / this.d_t))
        // this.counter += 0.1 * this.d_t;
        // this.offsetX += 5 * this.d_t;
        // this.offsetY = 100* Math.sin(this.counter);
        
        // Follow player
        if (this.focusedOnPlayer)
        {
            const speed = this.d_t / 500;
            if (Math.abs(YOU.x - this.curX) < speed)
            {
                this.curX = YOU.x;
            }
            else
            {
                this.curX -= (this.curX - YOU.x) * speed;
            }
            if (Math.abs(YOU.y - this.curY) < speed)
            {
                this.curY = YOU.y;
            }
            else
            {
                this.curY -= (this.curY - YOU.y) * speed;;
            }
    
            this.moveCamera(this.curX, this.curY);
        }


        this.drawScene();
        requestAnimationFrame((t) => this.update(t));
    }

    moveCamera(x, y)
    {
        this.offsetX = x * 12 * this.scale - (this.canvas.width / 2) + this.scale * 6;
        this.offsetY = y * 12 * this.scale - (this.canvas.height / 2) + this.scale * 6;
    }



     /***********/
    /** INPUT **/
    scroll(e)
    {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const oldX = ((e.clientX - rect.left) + this.offsetX) / this.scale;
        const oldY = ((rect.bottom - e.clientY) + this.offsetY) / this.scale;

        this.scale += Math.sign(e.deltaY) / 10 * this.scale;
        if (this.scale < 0.00001)
        {
            this.scale = 0.00001;
        }

        const newX = ((e.clientX - rect.left) + this.offsetX) / this.scale;
        const newY = ((rect.bottom - e.clientY) + this.offsetY) / this.scale;

        this.offsetY += (oldY - newY) * this.scale;
        this.offsetX += (oldX - newX) * this.scale;
    }

    mouseupdown(e)
    {
        e.preventDefault();
        if (e.button != 0 || e.target != this.canvas)
        {
            return;
        }

        if (e.type === 'mousedown')
        {
            // const rect = this.canvas.getBoundingClientRect();
            // const x = Math.floor(((e.clientX - rect.left) + this.offsetX) / this.scale / 16);
            // const y = Math.floor(((rect.bottom - e.clientY) + this.offsetY) / this.scale / 16);      
            // console.log(WORLD.getPerlin(x, y+5500, 10000),  WORLD.getPerlin(x, y, 25))
            this.keydown = true;
        }
        else
        {
            this.keydown = false;
        }

    }

    mousemove(e)
    {
        if (!this.keydown)
        {
            return;
        }
        this.focusedOnPlayer = false;
        this.offsetX -= e.movementX;
        this.offsetY += e.movementY;
    }

    resize()
    {
        this.width = this.parent.clientWidth;
        this.height = this.parent.clientHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.webGl.viewport(0, 0, this.width, this.height);
    }


     /***************/
    /** RENDERING **/

    // Adds the data to the vbo to render a sprite
    drawSprite(srcX, srcY, dstX, dstY)
    {
        if (this.vertexPtr >= this.maxVertices)
        {
            this.render();
        }

        const x1 = dstX * this.scale;
        const y1 = dstY * this.scale;
        const x2 = (dstX + this.detail) * this.scale;
        const y2 = (dstY + this.detail) * this.scale;
        
        const u1 = srcX + 0.01;
        const v1 = srcY + 0.99;
        const u2 = srcX + 0.99;
        const v2 = srcY + 0.01;

        // Top Left
        this.addAttribute(this.normalizePosition(x1, y1));
        this.addAttribute(this.normalizeTexture(u1, v1));

        // Bottom Left
        this.addAttribute(this.normalizePosition(x1, y2));
        this.addAttribute(this.normalizeTexture(u1, v2));

        // Top Right
        this.addAttribute(this.normalizePosition(x2, y1));
        this.addAttribute(this.normalizeTexture(u2, v1));

        // Bottom Right
        this.addAttribute(this.normalizePosition(x2, y2));
        this.addAttribute(this.normalizeTexture(u2, v2));

        this.indexPtr += 6;
    }

    render() {
        this.webGl.bufferSubData(this.webGl.ARRAY_BUFFER, 0, this.vertices, 0, this.vertexPtr);
        this.webGl.drawElements(this.webGl.TRIANGLES, this.indexPtr, this.webGl.UNSIGNED_SHORT, 0);

        this.indexPtr = 0;
        this.vertexPtr = 0;
    }
    
    addAttribute(vec2)
    {
        this.vertices[this.vertexPtr++] = vec2.x;
        this.vertices[this.vertexPtr++] = vec2.y;
    }

    // Normalizes a position in pixel space to -1 to 1
    // This is as hardcore as the math gets for this project
    normalizePosition(x, y)
    {
        return {
            x: Math.floor(x *12 - this.offsetX) / this.width * 2 - 1,
            y: Math.floor(y * 12 - this.offsetY) / this.height * 2 - 1,
        };
    }

    normalizeTexture(x, y)
    {
        return {
            x: x * 16 / this.spritesheet.width,
            y: y * 16 / this.spritesheet.height,
        };
    }

    drawScene()
    {
        this.webGl.clearColor(0, 0, 0, 0);
        this.webGl.clear(this.webGl.COLOR_BUFFER_BIT);

        this.detail = Math.ceil(1 / this.scale);
        
        const tileHeightRadius = Math.ceil(this.canvas.height / 12 / this.scale /2) + this.detail + 1;
        const tileWidthRadius = Math.ceil(this.canvas.width / 12 / this.scale / 2) + this.detail + 1;

        let centerTileX = YOU.x;
        let centerTileY = YOU.y;
        if (!this.focusedOnPlayer)
        {
            centerTileX = Math.floor(this.offsetX / 12 / this.scale) + tileWidthRadius;
            centerTileY = Math.floor(this.offsetY / 12 / this.scale) + tileHeightRadius;
        }

        // This keeps tiles chosen consistent so that everything doesn't jitter when zoomed out.
        centerTileX = Math.floor(centerTileX / this.detail) * this.detail;
        centerTileY = Math.floor(centerTileY / this.detail) * this.detail;

        for (let x = centerTileX - tileWidthRadius; x < centerTileX + tileWidthRadius; x += this.detail)
        {
            for (let y = centerTileY-tileHeightRadius; y < centerTileY+tileHeightRadius; y += this.detail)
            {
                switch (WORLD.deriveTile(x, y))
                {
                    case WORLD.TILES.sand:
                        this.drawSprite(1, 0, x, y);
                        break;
                    case WORLD.TILES.grass:
                        dynamicTile(this, WORLD.TILES.grass, 4, 3, x, y);
                        break;
                    case WORLD.TILES.tree:
                        // Draw island tree or sand tree
                        if (WORLD.getPerlin(x, y + 5500, 10000) > 0.57) {
                            this.drawSprite(2, 1, x, y);
                        }
                        else
                        {
                            this.drawSprite(1, 1, x, y);
                        }
                        break;
                    case WORLD.TILES.mountain:
                        dynamicTile(this, WORLD.TILES.mountain, 0, 3, x, y, true);
                        break;
                    case WORLD.TILES.swamp:
                        dynamicTile(this, WORLD.TILES.swamp, 12, 3, x, y);
                        break;
                    case WORLD.TILES.forest:
                        dynamicTile(this, WORLD.TILES.forest, 8, 3, x, y);
                        break;
                    case WORLD.TILES.water:
                        dynamicTile(this, WORLD.TILES.water, 16, 3, x, y);
                        break;
                    case WORLD.TILES.island:
                        this.drawSprite(2, 0, x, y);
                        break;
                    case WORLD.TILES.worldedge:
                        dynamicTile(this, WORLD.TILES.worldedge, 20, 3, x, y);
                        break;
                    case WORLD.TILES.house:
                        this.drawSprite(3, 1, x, y);
                        break;
                    case WORLD.TILES.city:
                        this.drawSprite(4, 1, x, y);
                        break;
                    case WORLD.TILES.startbox:
                        this.drawSprite(5, 1, x, y);
                        break;
                    default:
                        this.drawSprite(0, 0, x, y);
                }
            }
        }


        // draws objects
        for (let i = 0; i < WORLD.otherStumps.length; i++)
        {
            const obj = WORLD.otherStumps[i];
            // Draw island or sand
            if (WORLD.getPerlin(obj.x, obj.y + 5500, 10000) > 0.57) {
                this.drawSprite(2, 0, obj.x, obj.y);
            }
            else
            {
                this.drawSprite(1, 0, obj.x, obj.y);
            }
        }

        let playerWithPlayerCount = 0;
        for (let i = 0; i < WORLD.otherPlayers.length; i++)
        {
            const obj = WORLD.otherPlayers[i];
            // this.drawSprite(1, 2, obj.x, obj.y);
            if (obj.x == YOU.x && obj.y == YOU.y)
            {
                playerWithPlayerCount++;
            }
        }

        for (let i = 0; i < WORLD.otherObjs.length; i++)
        {
            const obj = WORLD.otherObjs[i];
            let ifDoorCheckIfOpened = 0;
            for (let j = 0; j < this.openedDoors; j++)
            {
                const numbers = this.openedDoors[j].split('|');
                const doorX = parseInt(numbers[0]);
                const doorY = parseInt(numbers[1]);
                if (doorX == obj.x && doorY == obj.y)
                {
                    ifDoorCheckIfOpened = 1;
                }
            }
            switch (obj.char)
            {
                case WORLD.TILES.wood_block:
                    dynamicTile(this, WORLD.TILES.wood_block, 0, 7, obj.x, obj.y, false, true );
                    break;
                case WORLD.TILES.scrap_block:
                    dynamicTile(this, WORLD.TILES.scrap_block, 4, 7, obj.x, obj.y, false, true );
                    break;
                case WORLD.TILES.steel_block:
                    dynamicTile(this.WORLD.TILES.steel_block, 8, 7, obj.x, obj.y, false, true );
                    break;
                case WORLD.TILES.anchor:
                    this.drawSprite(7, 1, obj.x, obj.y);
                    break;
                case WORLD.TILES.small_chest:
                    this.drawSprite(8, 1, obj.x, obj.y);
                    break;
                case WORLD.TILES.large_chest:
                    this.drawSprite(9, 1, obj.x, obj.y);
                    break;
                case WORLD.TILES.wood_door:
                    this.drawSprite(0 + ifDoorCheckIfOpened, 8, obj.x, obj.y);
                    break;
                case WORLD.TILES.scrap_door:
                    this.drawSprite(4 + ifDoorCheckIfOpened, 8, obj.x, obj.y);
                    break;
                case WORLD.TILES.steel_door:
                    this.drawSprite(8 + ifDoorCheckIfOpened, 8, obj.x, obj.y);
                    break;
                case WORLD.TILES.sign_block:
                    this.drawSprite(10, 1, obj.x, obj.y);
                case WORLD.TILES.city:
                    this.drawSprite(4, 1, x, y);
                case WORLD.TILES.house:
                    this.drawSprite(3, 1, x, y);
                    break;
                case '@':
                    this.drawSprite(4, 2, obj.x, obj.y);
                    break;
                default:
                    this.drawSprite(0, 0, obj.x, obj.y);
            }
        }

        // Draw Player
        if (playerWithPlayerCount > 2){
            this.drawSprite(3, 2, YOU.x, YOU.y);
        }
        else if (playerWithPlayerCount > 1)
        {
            this.drawSprite(2, 2, YOU.x, YOU.y);
        }
        else
        {
            this.drawSprite(0, 2, YOU.x, YOU.y);
        }

        // Draw Monument
        this.drawSprite(0, 1, 0, 0);

        this.render();
    }
    
}

/**
 * Helpers
 */

function generateIndices(n_indicies)
{
    const indicies = new Uint16Array(n_indicies);
    for (let i = 0, j = 0; i < n_indicies; i += 6, j += 4)
    {
        indicies[ i ] = j;
        indicies[i+1] = j + 1;
        indicies[i+2] = j + 2;
        indicies[i+3] = j + 1;
        indicies[i+4] = j + 3;
        indicies[i+5] = j + 2;
    }

    return indicies;
}

// Move to a class
// figure out how this is actually done
// Using a hecked bitwise flag thingie
const TILE_ENUM = {
    n: 1,
    e: 2,
    s: 4,
    w: 8,
};
function dynamicTile(renderer, tile, u, v, x, y, hasHeight = false, isObj = false)
{
    let value = 0;
    let detail = renderer.detail;
    if (hasHeight)
    {
        const height = perlinInt(x, y);
        WORLD.deriveTile(x  , y+detail) == tile && perlinInt(x, y+detail) < height + 1 ? value |= TILE_ENUM.n  : null;
        WORLD.deriveTile(x+detail, y  ) == tile && perlinInt(x+detail, y) < height + 1 ? value |= TILE_ENUM.e  : null;
        WORLD.deriveTile(x  , y-detail) == tile && perlinInt(x, y-detail) < height + 1 ? value |= TILE_ENUM.s  : null;
        WORLD.deriveTile(x-detail, y  ) == tile && perlinInt(x-detail, y) < height + 1 ? value |= TILE_ENUM.w  : null;
    }
    else if (isObj)
    {
        for (let i = 0; i < WORLD.otherObjs; i++)
        {
            const obj = WORLD.otherObjs[i];

            if (obj.char != tile) continue;

            (x == obj.x && y + detail == obj.y) ? value |= TILE_ENUM.n : null;
            (x + detail == obj.x && y == obj.y) ? value |= TILE_ENUM.e : null;
            (x == obj.x && y - detail == obj.y) ? value |= TILE_ENUM.s : null;
            (x - detail == obj.x && y == obj.y) ? value |= TILE_ENUM.w : null;
        }
    }
    else
    {
        WORLD.deriveTile(x  , y+detail) == tile ? value |= TILE_ENUM.n  : null;
        WORLD.deriveTile(x+detail, y  ) == tile ? value |= TILE_ENUM.e  : null;
        WORLD.deriveTile(x  , y-detail) == tile ? value |= TILE_ENUM.s  : null;
        WORLD.deriveTile(x-detail, y  ) == tile ? value |= TILE_ENUM.w  : null;
    }

    switch (value)
    {
        case               TILE_ENUM.e | TILE_ENUM.s               : renderer.drawSprite(u  , v  , x, y); break;
        case               TILE_ENUM.e | TILE_ENUM.s | TILE_ENUM.w : renderer.drawSprite(u+1, v  , x, y); break;
        case                             TILE_ENUM.s | TILE_ENUM.w : renderer.drawSprite(u+2, v  , x, y); break;
        case                             TILE_ENUM.s               : renderer.drawSprite(u+3, v  , x, y); break;
        case TILE_ENUM.n | TILE_ENUM.e | TILE_ENUM.s               : renderer.drawSprite(u  , v+1, x, y); break;
        case TILE_ENUM.n | TILE_ENUM.e | TILE_ENUM.s | TILE_ENUM.w : renderer.drawSprite(u+1, v+1, x, y); break;
        case TILE_ENUM.n |               TILE_ENUM.s | TILE_ENUM.w : renderer.drawSprite(u+2, v+1, x, y); break;
        case TILE_ENUM.n |               TILE_ENUM.s               : renderer.drawSprite(u+3, v+1, x, y); break;
        case TILE_ENUM.n | TILE_ENUM.e                             : renderer.drawSprite(u  , v+2, x, y); break;
        case TILE_ENUM.n | TILE_ENUM.e |               TILE_ENUM.w : renderer.drawSprite(u+1, v+2, x, y); break;
        case TILE_ENUM.n |                             TILE_ENUM.w : renderer.drawSprite(u+2, v+2, x, y); break;
        case TILE_ENUM.n                                           : renderer.drawSprite(u+3, v+2, x, y); break;
        case               TILE_ENUM.e                             : renderer.drawSprite(u  , v+3, x, y); break;
        case               TILE_ENUM.e |               TILE_ENUM.w : renderer.drawSprite(u+1, v+3, x, y); break;
        case                                           TILE_ENUM.w : renderer.drawSprite(u+2, v+3, x, y); break;
        default                                                    : renderer.drawSprite(u+3, v+3, x, y); break;


    }
}

// turns a -1 to 1 float to a -10 to 10 int
function perlinInt(x, y)
{
    let value = WORLD.getPerlin(x, y);
    let smooth = WORLD.getPerlin(x, y+5500, 10000) - WORLD.getPerlin(x, y, 25);

    value =  Math.floor((value) * 30);
    if (smooth < 0.1)
    {
        value++;
    }

    return value;
}


/**
 * SHADERS
 */

const vertexShaderSource = `#version 300 es
    in vec4 a_position;
    in vec2 a_texcoord;

    out vec2 v_texcoord;

    void main()
    {
        gl_Position = a_position;
        v_texcoord = a_texcoord;
    }
`;


const fragmentShaderSource = `#version 300 es
    precision mediump float;

    in vec2 v_texcoord;
    uniform sampler2D u_texture;

    out vec4 color;

    void main()
    {
        color = texture(u_texture, v_texcoord);
    }
`;

const stylesSource = `
#game-content{display:flex !important;}
div.mid-screencontainer{width:70% !important;position:relative;}
div.side-screencontainer{width:15% !important;}
#arrow-box{width:114px !important;height:114px !important;}
div.bottom-box-left-menu{height:98px !important;}
div.arrows{width:30px !important;height:30px !important;}
div.arrows > img{width:30px;}
#bottom-box{z-index:2;position:relative;width:auto !important;}
#world-time, #world-position{position:relative; z-index:2}
#hotbar-box{z-index:2;position:relative;width:max-content !important;}
#canvas{z-index:1;position:absolute;left:0;right:0;top:0;bottom:0;}
#world-box{height:calc(100% - 250px);}
`;