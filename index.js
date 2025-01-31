
module.exports = function boxOpener(dispatch){
	const command = dispatch.command || dispatch.require.command;
	
	let	hooks = [],
		enabled = false,
		boxEvent = null,
		gacha_detected = false,
		gacha_contract = 0,
		isLooting = false,
		location = null,
		timer = null,
		delay = 5500,
		useDelay = false,
		statOpened = 0,
		statUsed = 0,
		statStarted = null,
		scanning = false/*,
		inventory = null*/;
		
	command.add('box', () => {
		if(!enabled && !scanning)
		{
			scanning = true;
			load();
			command.message('Please normally open a box now and the script will continue opening it');
		}
		else
		{
			stop();
		}
	});
		
	command.add('boxdelay', (arg) => {
		if(arg === "0")
		{
			useDelay = false;
			delay = 5500;
			command.message("Turning OFF minimum box opening delay, enjoy the speed");
		}
		else if(!isNaN(arg))
		{
			useDelay = true;
			delay = parseInt(arg);
			command.message("Minimum box opening delay is set to: " + (delay / 1000) + " sec");
		}
		else
		{
			command.message("Minimum box opening delay is set to: " + (useDelay ? (delay / 1000) + " sec" : "no delay" ));
		}
    });
	
	dispatch.hook('C_PLAYER_LOCATION', 5, event =>{location = event});
	
	dispatch.game.initialize("inventory");
	
	dispatch.game.inventory.on('update', () => {
		if(!enabled) return;
		
		isLooting = false; // event comes only after all S_SYSTEM_MESSAGE_LOOT_ITEM (probably)
	});
	
	function load()
	{
		/*hook('S_INVEN', 18, event =>{ // pre patch 85
			if(!enabled) return
			
			isLooting = false; // S_INVEN comes only after all S_SYSTEM_MESSAGE_LOOT_ITEM

			if(event.first) inventory = []
			else if(!inventory) return

			for(let item of event.items) inventory.push(item)

			if(!event.more) 
			{
				let box = false
				for(let item of inventory) 
				{
					if(item.slot < 40) continue 
					if(item.id == boxId)
					{
						box = true
					}
				}
				if(!box) 
				{
					command.message("You ran out of boxes, stopping");
					stop();
				}
				inventory.splice(0,inventory.length)
				inventory = [];
				inventory = null
			}
		});*/
		
		hook('C_USE_ITEM', 3, event =>{
			if(gacha_detected) return false; // Prevent spaming right click on gacha-type box while its already opening.
			if(!scanning) return
		
			if(scanning){
				boxEvent = event;
				boxEvent.dbid = 0n; // to open all inv slots
				command.message("Box set to: "+event.id+", proceeding to auto-open it with "  + (useDelay ? "a minimum " + (delay / 1000) + " sec delay" : "no delay" ));
				scanning = false;
				
				let d = new Date();
				statStarted = d.getTime();
				enabled = true;
				timer = dispatch.setTimeout(openBox,delay);
				//return true; // for consistency of sent data
			}
		});
		
		hook('S_SYSTEM_MESSAGE_LOOT_ITEM', 'raw', () => {
			if(!gacha_detected && !isLooting && boxEvent)
			{
				isLooting = true;
				if(!useDelay)
				{
					dispatch.clearTimeout(timer);
					openBox();
				}
			}
		});
		
		hook('S_GACHA_END', 'raw', () => {
			if(boxEvent && gacha_detected)
			{
				dispatch.clearTimeout(timer);
				if(useDelay) timer = dispatch.setTimeout(openBox,delay);
				else process.nextTick(openBox);
			}
		});
		
		hook('S_SYSTEM_MESSAGE', 1, event => {
			const msg = dispatch.parseSystemMessage(event.message).id;
			if(['SMT_ITEM_MIX_NEED_METERIAL', 'SMT_CANT_CONVERT_NOW', 'SMT_GACHA_NO_MORE_ITEM_SHORT', 'SMT_NOTI_LEFT_LIMITED_GACHA_ITEM', 'SMT_GACHA_CANCEL', 'SMT_COMMON_NO_MORE_ITEM_TO_USE'].includes(msg))
			{
				command.message("Box can not be opened anymore, stopping");
				stop();
			}
		});
		
		hook('S_REQUEST_CONTRACT', dispatch.majorPatchVersion > 107 ? 2 : 1, event => {
			if(event.type !== 53) return;
			dispatch.hookOnce('S_GACHA_START', 'raw', () => {
				gacha_detected = true;
				gacha_contract = event.id;
				openBox();
				return false;
			})
			return false;
		});

		hook('S_CANCEL_CONTRACT', 1, event => {
			if (!gacha_detected || event.type !== 53) return;
			gacha_contract = 0;
			stop();
		});
	}
	
	function openBox() 
	{
		if(dispatch.game.inventory.getTotalAmount(boxEvent.id) > 0)
		{
			if(gacha_detected)
			{
				if(dispatch.majorPatchVersion >= 99)
				{
					dispatch.toServer('C_GACHA_TRY', 2,{
						id:gacha_contract,
						amount: 1
					});
				}
				else
				{
					dispatch.toServer('C_GACHA_TRY', 1,{
						id:gacha_contract
					});
				}
			}
			else {
				boxEvent.loc = location.loc;
				boxEvent.w = location.w;
				dispatch.toServer('C_USE_ITEM', 3, boxEvent);
				if(useDelay)
				{
					statUsed++;	// counter for used items other than boxes
				}
				timer = dispatch.setTimeout(openBox,delay);
			}
			statOpened++;
		}
		else
		{
			command.message("You ran out of boxes, stopping");
			stop();
		}
	}
	
	function addZero(i) 
	{
		if (i < 10) {
			i = "0" + i;
		}
		return i;
	}

	function stop() 
	{
		unload();
		if(scanning)
		{
			scanning = false;
			command.message('Scanning for a box is aborted');
		}
		else
		{
			if(gacha_detected && gacha_contract) dispatch.toServer('C_GACHA_CANCEL', 1, { id: gacha_contract });
			if(useDelay && statOpened === 0) statOpened = statUsed;
			if(!gacha_detected) statOpened += 1; // Add the box we used at start if not gacha.
			dispatch.clearTimeout(timer);
			enabled = false;
			gacha_detected = false;
			gacha_contract = 0;
			boxEvent = null;
			let d = new Date();
			let t = d.getTime();
			let timeElapsedMSec = t-statStarted;
			d = new Date(1970, 0, 1); // Epoch
			d.setMilliseconds(timeElapsedMSec);
			let h = addZero(d.getHours());
			let m = addZero(d.getMinutes());
			let s = addZero(d.getSeconds());
			command.message('Box opener stopped. Opened: ' + statOpened + ' boxes. Time elapsed: ' + (h + ":" + m + ":" + s) + ". Per box: " + ((timeElapsedMSec / statOpened) / 1000).toPrecision(2) + " sec");
			statOpened = 0;
			statUsed = 0;
		}
	}
	
	function unload() {
		if(hooks.length) {
			for(let h of hooks) dispatch.unhook(h)

			hooks = []
		}
	}

	function hook() {
		hooks.push(dispatch.hook(...arguments))
	}
}
