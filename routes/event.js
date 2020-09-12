var express = require("express");
var admin = require("../firebase-proj");	
var path = require("path");
var createError = require("http-errors");
var fs = require("fs").promises;

var router = express.Router();
var db = admin.firestore();

async function getUserData(uid) {
	doc = db.collection('schoolUsers').doc(uid);
	docref = await doc.get()
	if (!docref.exists) {
		return null
	} else {
		return docref.data()
	}
}

async function getTakenSeats(subevent) {
	doc = db.collection('events').doc(subevent);
	docref = await doc.get()
	if (!docref.exists) {
		return 0
	} else {
		return docref.data().participants
	}
}

async function renderEvent(req, res, next) {
	var event = req.params.event;
	const sessionCookie = req.cookies.session || "";

	var userData = {};

	try {
		const readRoutes = await fs.readFile(path.join(__dirname, "eventRoutes.json"), "utf8")
		routingData = JSON.parse(readRoutes)
		if (!(event in routingData)) {
			return next(createError(404))
		} 
		routingData = routingData[event]
	
		const webrender = () => {
			res.render("event", {
				eventName: routingData.name,
				title: `${routingData.title} - Kaafila`,
				cssID: routingData.cssID,
				pageID: "events/" + event,
				headerFont: routingData.headerFont,
				bannerName: event,
				eventCategories: routingData.eventCategories,
				[routingData.navID]: true,
				userData: userData,
			});
		}
	
		const firebaseUserClaims = await admin.auth().verifySessionCookie(sessionCookie, true)
		const user = await admin.auth().getUser(firebaseUserClaims.sub)
		userData.photoURL = user.photoURL
		webrender();
	} catch (err) {
		if (err.code !== "auth/argument-error") { console.log(err); }
	}

}

async function renderSubevent(req, res, next) {
	var event = req.params.event;
	var subevent = req.params.subevent;

	const sessionCookie = req.cookies.session || "";

	var userData = {};
	var registration = {};
	
	try {
		const readRoutes = await fs.readFile(path.join(__dirname, "eventRoutes.json"), "utf8")
		routingData = JSON.parse(readRoutes)
		if (!(event in routingData)) {
			return next(createError(404))
		} 
		routingData = routingData[event]
		if (!(subevent in routingData)) {
			return next(createError(404))
		}
		var registration = routingData[subevent].registration || {};
	
		const webrender = () => {
			res.render("subevent", {
				title: `${routingData[subevent].name} - ${routingData.title} - Kaafila`,
				url: subevent,
				subeventName: routingData[subevent].name,
				subeventImage: routingData[subevent].image,
				subeventDesc: routingData[subevent].description,
				cssID: routingData.cssID,
				[routingData.navID]: true,
				pageID: "subevents/" + routingData[subevent].pageID,
				formID: routingData[subevent].registration ? "subevents/forms/" + routingData[subevent].registration.formID : null,
				registration: Object.keys(registration).length > 0 ? registration : null,
				userData: Object.keys(userData).length > 0 ? userData : null,
				scripts: ["/js/subevent.js"]
			});
		}
	
		const firebaseUserClaims = await admin.auth().verifySessionCookie(sessionCookie, true)
		const user = await admin.auth().getUser(firebaseUserClaims.sub)
		userData.photoURL = user.photoURL
		
		if (Object.keys(registration).length > 0) {
			const takenSeats = await getTakenSeats(subevent)
			if (registration.maxSeats) {
				if (takenSeats === registration.maxSeats) {
					registration.seatsFull = true
				} else if (registration.maxSeatsPerSchool) {
					if (takenSeats + registration.maxSeatsPerSchool > registration.maxSeats) {
						registration.maxSeatsPerSchool = registration.maxSeats - takenSeats
					}
				}
			}
		}
		const userFirestoreData = await getUserData(firebaseUserClaims.sub)
		userData.schoolRepName = userFirestoreData.schoolRepName;
		userData.schoolName = userFirestoreData.schoolName;
		if (userFirestoreData.registeredEvents) {
			if (subevent in userFirestoreData.registeredEvents) {
				registration.alreadyRegistered = true;
			}
		}
		webrender();
	} catch (err) {
		if (err.code !== "auth/argument-error") { console.log(err); }
	}

}

async function subeventRegistration(req, res) {
	const sessionCookie = req.cookies.session || "";
	var subevent = req.body.subevent;
	var data = JSON.parse(req.body.data);

	try {
		const firebaseUserClaims = await admin.auth().verifySessionCookie(sessionCookie, true)
		doc = db.collection('schoolUsers').doc(firebaseUserClaims.sub);
		docref = await doc.get()
		registeredEvents = docref.data().registeredEvents || {};
		registeredEvents[subevent] = data;
		const updateDatabase = doc.update({registeredEvents: registeredEvents})
	
		doc = db.collection('events').doc(subevent);
		docref = await doc.get()

		if (subevent == "strings-attached-solos") {
			if (docref.exists) { 
				participants = docref.data().participants || {} 
				Object.keys(participants).forEach((val) => {
					data.participants[val] += participants[val]
				});
			}
			doc.set({participants: data.participants})
			res.sendStatus(200);
		} else {
			if (docref.exists) { participants = docref.data().participants + data.participants || data.participants; } 
			else { participants = data.participants; }
			doc.set({participants: participants})
			res.sendStatus(200);
		}
	} catch (err) {
		if (err.code !== "auth/argument-error") { 
			console.log(err); 
			res.send(err)
		}
	}
}

async function subeventSubmission(req, res) {
	var subevent = req.body.subevent;
	const sessionCookie = req.cookies.session || "";

	try {
		const firebaseUserClaims = await admin.auth().verifySessionCookie(sessionCookie, true)
		const docref = await db.collection('schoolUsers').doc(firebaseUserClaims.sub).get();
		submissionPath = `registeredEvents.${subevent}`;
		submissionData = JSON.parse(req.body.data);
		if (docref.exists) {
			const updateDatabase = await doc.update({[submissionPath]: submissionData});
			res.sendStatus(200);
		} else {
			res.send("No User Exists");
		}
	} catch (err) {
		if (err.code !== "auth/argument-error") { 
			console.log(err); 
			res.send(err)
		}
	}
}

router.get("/events/:event", (req, res, next) => renderEvent(req, res, next));
router.get("/events/:event/:subevent", (req, res, next) => renderSubevent(req, res, next));
router.post("/registration", (req, res) => subeventRegistration(req, res));
router.post("/submission", (req, res) => subeventSubmission(req, res));

module.exports = router;