const EventEmitter = require('events');
const config = require('config');
const kube = require('../kube');

class PodLongNotReady extends EventEmitter{
	constructor(){
		super();
		this.minimumTime = config.get('not_ready_min_time');
	}

	start(){
		setInterval(() => {
			this.check();
		}, config.get('interval'));

		return this;
	}

	async check(){
		let pods = await kube.getPods();

		for(let pod of pods){

			// Ignore pod if the annotation is set and evaluates to true
			if(pod.metadata.annotations['kube-slack/ignore-pod']){
				continue;
			}

			if(!pod.status || !pod.status.conditions){
				continue;
			}

			let readyStatus = pod.status.conditions.filter((item) => item.type === 'Ready');
			
			if(readyStatus.length === 0){
				continue;
			}

			readyStatus = readyStatus[0];

			if(readyStatus.status === 'True'){
				continue;
			}
			
			if(readyStatus.reason === 'PodCompleted'){
				continue;
			}

			let notReadySince = new Date(readyStatus.lastTransitionTime).getTime();
			let notReadyDuration = new Date().getTime() - notReadySince;

			if(notReadyDuration < this.minimumTime){
				continue;
			}

			let key = pod.metadata.name;

			if(pod.metadata.ownerReferences && pod.metadata.ownerReferences.length > 0){
				key = pod.metadata.ownerReferences[0].name;
			}

			this.emit('message', {
				fallback: `Pod ${pod.metadata.namespace}/${pod.metadata.name} is not ready: ${readyStatus.reason} - ${readyStatus.message}`,
				color: 'danger',
				title: `${pod.metadata.namespace}/${pod.metadata.name}: ${readyStatus.reason}`,
				text: readyStatus.message,
				_key: key,
			});
		}
	}
}

module.exports = () => new PodLongNotReady().start();
