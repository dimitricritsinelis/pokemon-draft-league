/* Internal scouting model. These grades are game mechanics, not displayed Pokémon stats. */
(() => {
  'use strict';

  // Each species is reviewed individually. Traits: possession control, field awareness,
  // functional strength, contact durability, football mobility, passing accuracy,
  // and a passing ceiling imposed by anatomy. Psychic/tentacle control is explicit;
  // a high Pokédex speed never gives an armless Pokémon a quarterback's mechanics.
  // Mouth/talon catches can support a runner or receiver without implying that
  // the same species can grip and release an accurate forward pass.
  const profiles = [
    [1, 61, 59, 45, 53, 60, 42, 54, 'Vines can grip; a small quadruped with limited throwing leverage.'],
    [2, 67, 64, 62, 68, 54, 46, 59, 'Stronger vine control, but plant bulk slows its feet.'],
    [3, 71, 71, 88, 90, 38, 48, 61, 'Massive planted blocker; vines support snaps, not elite passing.'],
    [4, 63, 51, 30, 35, 75, 49, 68, 'Small biped with hands; developing coordination and contact strength.'],
    [5, 72, 57, 59, 59, 85, 62, 77, 'Armed biped with aggression and improved throwing leverage.'],
    [6, 78, 73, 86, 83, 92, 71, 86, 'Strong arms, wings and aerial reach; good but not precise field leadership.'],
    [7, 68, 58, 38, 66, 63, 58, 73, 'Hands and a shell; accurate water aim suggests workable mechanics.'],
    [8, 75, 67, 56, 78, 68, 65, 80, 'Handed biped with a reliable shell and mature ball control.'],
    [9, 83, 79, 93, 96, 52, 75, 85, 'Powerful shell-backed lineman; cannon aim helps a capable passer.'],
    [10, 5, 22, 9, 18, 20, 3, 12, 'Tiny crawling caterpillar; no arms or plausible throwing motion.'],
    [11, 0, 12, 13, 86, 3, 0, 6, 'Immobile cocoon; Harden does not provide hands, reads or a throwing motion.'],
    [12, 46, 60, 31, 36, 86, 29, 39, 'Airborne route coverage; small feet and wings limit ball handling.'],
    [13, 4, 20, 11, 20, 23, 2, 10, 'Tiny crawler with a stinger; little football ball control.'],
    [14, 0, 12, 17, 86, 3, 0, 6, 'Immobile, armless cocoon despite defensive shell strength.'],
    [15, 39, 58, 64, 46, 98, 21, 29, 'Fast aerial defender; drills cannot grip and throw a football safely.'],
    [16, 28, 47, 16, 24, 88, 12, 25, 'Small bird; feet can carry briefly, wings cannot pass well.'],
    [17, 42, 63, 46, 50, 94, 19, 34, 'Keen flight and tracking; throwing remains anatomically limited.'],
    [18, 72, 76, 70, 67, 99, 28, 43, 'Elite aerial range with competent talon catches, not arm mechanics.'],
    [19, 57, 42, 25, 28, 96, 13, 24, 'Quick small runner; mouth carrying is easier than passing.'],
    [20, 68, 57, 49, 55, 93, 19, 31, 'Strong bite and agile feet; limited independent ball manipulation.'],
    [21, 27, 44, 23, 27, 91, 10, 24, 'Fast aggressive bird with a small frame and weak throwing control.'],
    [22, 67, 66, 68, 57, 99, 24, 40, 'Long aerial reach and tracking; talons favor catches over passes.'],
    [23, 24, 45, 37, 43, 55, 12, 22, 'Coils can restrain or carry but an armless snake cannot deliver a normal pass.'],
    [24, 44, 64, 74, 73, 69, 19, 30, 'Powerful wrap tackler; coils and jaws limit fine throwing mechanics.'],
    [25, 72, 67, 42, 44, 97, 66, 78, 'Nimble handed biped with strong reactions but a tiny contact frame.'],
    [26, 80, 73, 67, 64, 95, 73, 85, 'Dexterous hands, balance tail and reliable burst.'],
    [27, 52, 49, 48, 76, 69, 35, 48, 'Tough small digger; claws permit carrying but awkward release.'],
    [28, 65, 61, 77, 88, 82, 43, 60, 'Armored clawed runner; stronger on defense than in precision passing.'],
    [29, 27, 44, 28, 41, 65, 8, 20, 'Small quadruped without hands; horns help contact, not passing.'],
    [30, 36, 52, 49, 60, 74, 15, 29, 'Sturdy quadruped; mouth carrying and limited release.'],
    [31, 74, 71, 87, 91, 66, 56, 76, 'Powerful plated biped with arms and a defensive temperament.'],
    [32, 27, 42, 31, 40, 69, 8, 20, 'Small quadruped with a horn but no passing hands.'],
    [33, 37, 51, 56, 61, 81, 14, 28, 'Hard-charging quadruped with a throwing constraint.'],
    [34, 73, 66, 92, 91, 70, 55, 75, 'Strong armored biped; excellent contact and usable hands.'],
    [35, 76, 71, 26, 36, 40, 67, 78, 'Small dexterous biped; clever coordination, weak contact anchor.'],
    [36, 86, 84, 51, 61, 50, 79, 89, 'Clever, sure-handed biped with good play recognition.'],
    [37, 57, 66, 24, 34, 91, 13, 29, 'Clever fox runner; mouth-only carrying limits a quarterback.'],
    [38, 77, 90, 57, 68, 98, 26, 38, 'Wise quick fox; excellent reads cannot substitute for throwing anatomy.'],
    [39, 63, 51, 20, 47, 24, 41, 62, 'Round handed biped; soft body and limited acceleration.'],
    [40, 73, 65, 49, 72, 35, 53, 73, 'Stretchy, durable catcher but slow change of direction.'],
    [41, 18, 48, 23, 25, 88, 6, 18, 'Echolocation gives tracking, not a football grip or release.'],
    [42, 28, 67, 58, 58, 96, 9, 23, 'Large fast bat; great pursuit but no functional throwing hands.'],
    [43, 13, 36, 17, 34, 20, 5, 15, 'Root-like feet and no arms; little carrying or throwing capacity.'],
    [44, 29, 43, 34, 49, 17, 10, 23, 'Short arms and heavy bloom constrain both routes and release.'],
    [45, 37, 57, 58, 68, 16, 18, 31, 'Broad bloom and sluggish feet; useful resistance, poor passing mechanics.'],
    [46, 22, 33, 24, 43, 29, 9, 19, 'Tiny crab-like bug; pincers grip poorly and the mushroom restricts motion.'],
    [47, 34, 37, 56, 71, 19, 12, 24, 'Heavy fungal control and claws; durable but slow and inflexible.'],
    [48, 42, 51, 40, 48, 57, 24, 37, 'Small hands and good eyes; furry frame lacks power and accuracy.'],
    [49, 26, 66, 40, 45, 93, 13, 28, 'Agile flying coverage insect; wings and tiny limbs limit passing.'],
    [50, 0, 45, 18, 24, 72, 0, 8, 'Burrowing body with no visible arms; ground speed is not ball control.'],
    [51, 0, 61, 60, 50, 82, 0, 10, 'Coordinated burrowers can pursue but cannot catch, snap or throw normally.'],
    [52, 75, 70, 27, 34, 96, 60, 75, 'Clever dexterous feline with usable forepaws and a small frame.'],
    [53, 75, 77, 58, 55, 99, 24, 39, 'Agile quadruped; paws and mouth favor running over an upright pass.'],
    [54, 64, 28, 35, 43, 41, 26, 42, 'Hands exist but headaches and confusion impair reads and release.'],
    [55, 88, 83, 73, 73, 86, 83, 89, 'Coordinated handed biped with calm awareness and athletic movement.'],
    [56, 84, 44, 58, 50, 95, 48, 63, 'Dexterous agile monkey; temper limits decision making.'],
    [57, 90, 42, 89, 78, 96, 46, 65, 'Explosive contact defender; rage makes a less reliable quarterback.'],
    [58, 66, 73, 48, 53, 96, 17, 30, 'Loyal quick dog; good discipline but lacks passing hands.'],
    [59, 85, 88, 93, 89, 99, 26, 39, 'Massive fast runner with a secure mouth carry; no human-style pass.'],
    [60, 5, 28, 15, 26, 24, 1, 9, 'Tadpole with feet but no arms and poor land agility.'],
    [61, 69, 53, 46, 53, 65, 47, 67, 'Has workable fists and upright feet; coordination is still developing.'],
    [62, 91, 72, 91, 90, 83, 72, 85, 'Muscular biped with capable hands and stamina.'],
    [63, 73, 87, 23, 18, 17, 75, 79, 'Psychic manipulation supplies control; frequent sleeping hurts mobility and awareness.'],
    [64, 91, 96, 46, 33, 63, 92, 96, 'Dexterous telekinetic passer and very strong play recognition.'],
    [65, 98, 100, 56, 31, 82, 99, 100, 'Exceptional intellect and precise psychic/hand control; physically fragile.'],
    [66, 86, 61, 64, 61, 83, 62, 79, 'Handed young martial athlete; great leverage for its size.'],
    [67, 94, 69, 93, 88, 86, 72, 87, 'Muscular two-handed blocker with practiced body control.'],
    [68, 99, 73, 100, 96, 81, 76, 90, 'Four strong arms and exceptional contact leverage; passing reads are only good.'],
    [69, 45, 35, 23, 25, 41, 15, 29, 'Flexible vine arms can carry; flimsy rooted body limits throwing.'],
    [70, 29, 41, 38, 40, 10, 8, 20, 'Hanging pitcher plant lacks steady feet and fine release mechanics.'],
    [71, 47, 51, 64, 60, 26, 22, 36, 'Vines and mouth grasp well enough for contact; difficult upright mechanics.'],
    [72, 43, 43, 38, 48, 11, 25, 32, 'Tentacles can hold a ball but a water-bound body struggles on turf.'],
    [73, 67, 66, 76, 77, 20, 39, 48, 'Many tentacles offer control and reach; land motion still limits a passer.'],
    [74, 72, 46, 62, 88, 37, 43, 60, 'Strong hands and rock durability, but short leverage and limited footwork.'],
    [75, 80, 53, 88, 95, 56, 49, 66, 'Four arms and heavy rock frame; strong blocking, modest accuracy.'],
    [76, 84, 65, 98, 99, 58, 58, 73, 'Massive shell and functional hands; excellent trench anchor.'],
    [77, 62, 57, 51, 45, 99, 7, 22, 'Fast horse; can carry in its mouth but hooves cannot throw.'],
    [78, 76, 72, 81, 73, 100, 12, 27, 'Elite straight-line horse runner; anatomy still blocks quarterback play.'],
    [79, 33, 24, 37, 62, 25, 11, 26, 'Slow reactions and quadrupedal paws limit reads and passing.'],
    [80, 73, 56, 77, 86, 24, 49, 68, 'Handed shell-backed biped; strong anchor but slow recognition and release.'],
    [81, 42, 63, 27, 79, 70, 30, 40, 'Magnetic manipulation is coarse; a floating steel body has no normal throwing joints.'],
    [82, 64, 79, 59, 92, 74, 47, 59, 'Coordinated magnets improve control; metal structure favors defense.'],
    [83, 82, 69, 43, 45, 75, 58, 74, 'Practiced leek handling provides rare bird dexterity and workable release.'],
    [84, 39, 48, 55, 50, 99, 13, 27, 'Excellent running legs; multiple beaks can carry but do not throw well.'],
    [85, 79, 64, 85, 75, 100, 22, 37, 'Fast coordinated triple-headed runner, still without passing arms.'],
    [86, 20, 40, 35, 70, 11, 7, 18, 'Aquatic seal with flippers; poor turf movement and grip.'],
    [87, 31, 61, 65, 87, 14, 13, 25, 'Durable aquatic body; mobility and release are severely constrained on land.'],
    [88, 52, 32, 45, 66, 12, 24, 35, 'Sludge arms can grasp but cannot sustain precise passing mechanics.'],
    [89, 68, 47, 84, 95, 9, 35, 46, 'Sticky mass holds and blocks well; poor footwork and clean release.'],
    [90, 0, 26, 13, 88, 3, 0, 6, 'Small shell and no throwing limbs; near-static on turf.'],
    [91, 7, 52, 60, 100, 7, 3, 12, 'Huge durable shell without ball handling arms or mobile feet.'],
    [92, 48, 67, 31, 31, 97, 32, 45, 'Clever levitating gas can influence the ball but has no stable hands.'],
    [93, 87, 80, 53, 49, 98, 75, 85, 'Separate ghost hands permit catches and passes; physical contact ability is bounded.'],
    [94, 92, 90, 77, 74, 96, 88, 95, 'Clever solid-bodied ghost with dexterous hands and deceptive routes.'],
    [95, 13, 54, 92, 95, 57, 6, 16, 'Huge stone serpent; impressive trench strength cannot create a throwing arm.'],
    [96, 74, 66, 42, 58, 54, 60, 73, 'Hands and psychic awareness support a modest quarterback.'],
    [97, 90, 87, 64, 72, 63, 82, 91, 'Precise pendulum/psychic control with good reads; average foot speed.'],
    [98, 40, 38, 43, 60, 48, 16, 29, 'Pincers can carry but offer awkward snaps, catches and passes.'],
    [99, 58, 52, 95, 90, 45, 26, 40, 'Huge claw and shell favor leverage and contact over clean ball release.'],
    [100, 0, 42, 27, 47, 82, 0, 7, 'Fast rolling sphere without hands or a football grip.'],
    [101, 0, 61, 54, 65, 98, 0, 10, 'Excellent rolling speed does not produce passing or receiving limbs.'],
    [102, 34, 49, 21, 32, 8, 17, 27, 'Psychic eggs have limited coordinated control and little football movement.'],
    [103, 61, 81, 88, 84, 37, 42, 57, 'Tall psychic tree can manipulate a ball; slow feet and no throwing arms.'],
    [104, 79, 52, 43, 59, 53, 70, 77, 'Practiced bone throwing gives reliable mechanics despite small stature.'],
    [105, 91, 73, 80, 87, 66, 91, 93, 'Expert ranged bone control and strong contact defense.'],
    [106, 60, 63, 90, 66, 98, 39, 57, 'Flexible elite legs and powerful kicks; hand/release technique is secondary.'],
    [107, 95, 72, 89, 78, 84, 70, 85, 'Fast coordinated boxing hands and good contact balance.'],
    [108, 76, 54, 74, 82, 42, 44, 63, 'Hands and prehensile tongue improve possession; poor burst and precision.'],
    [109, 3, 39, 23, 52, 49, 1, 9, 'Floating gas sphere with no ball handling limbs.'],
    [110, 6, 57, 59, 79, 40, 2, 12, 'Two gas bodies absorb contact but cannot execute a normal pass.'],
    [111, 22, 36, 90, 92, 81, 5, 16, 'Armored charging quadruped; no hands and limited play recognition.'],
    [112, 73, 57, 99, 97, 58, 45, 65, 'Massive armored biped with workable hands; strongest in the trenches.'],
    [113, 84, 82, 32, 86, 60, 65, 79, 'Gentle sure-handed caretaker with resilience but little blocking force.'],
    [114, 78, 53, 52, 77, 46, 37, 57, 'Prehensile vines offer possession and wraps; release is less precise.'],
    [115, 89, 85, 92, 92, 91, 77, 88, 'Powerful coordinated parent with hands, balance and protective awareness.'],
    [116, 0, 32, 15, 28, 2, 3, 7, 'Tiny water-bound seahorse; aimed water is not a football throwing grip.'],
    [117, 3, 55, 44, 66, 3, 9, 13, 'Aquatic seahorse without arms or land locomotion.'],
    [118, 0, 34, 28, 35, 2, 0, 5, 'Fish lacks arms and turf locomotion.'],
    [119, 0, 53, 61, 64, 3, 0, 8, 'Strong aquatic fish; no passing or carrying limbs on a field.'],
    [120, 35, 46, 38, 66, 27, 12, 24, 'Star limbs can clasp roughly but lack stable football release mechanics.'],
    [121, 69, 84, 68, 83, 50, 43, 59, 'Psychic control and spinning motion help; no dedicated throwing hand.'],
    [122, 98, 96, 39, 63, 66, 95, 98, 'Exceptional hand coordination, spatial reads and precise manipulation.'],
    [123, 43, 80, 88, 75, 100, 18, 30, 'Elite mobile pass rusher; blades cannot safely grip and release a ball.'],
    [124, 86, 83, 53, 56, 52, 76, 87, 'Handed psychic humanoid with good precision but slow footwork.'],
    [125, 88, 74, 85, 73, 96, 73, 86, 'Dexterous electric biped with strength and quick reactions.'],
    [126, 79, 64, 87, 77, 77, 59, 76, 'Strong armed biped; better contact presence than tactical accuracy.'],
    [127, 62, 63, 97, 89, 78, 35, 54, 'Exceptional lifting strength and armored tackles; claws hurt passing finesse.'],
    [128, 66, 48, 96, 88, 98, 8, 24, 'Explosive bull runner with no hands and impulsive charging instincts.'],
    [129, 0, 12, 6, 25, 2, 0, 4, 'Flopping fish; no throwing limbs and almost no turf movement.'],
    [130, 22, 55, 100, 95, 38, 7, 18, 'Immense aquatic serpent; strength and reach cannot supply passing hands.'],
    [131, 27, 89, 77, 92, 9, 17, 30, 'Intelligent shell-backed swimmer; flippers and turf movement constrain football.'],
    [132, 70, 76, 54, 56, 55, 58, 76, 'Transformation gives adaptable control; neutral baseline avoids copying an opponent star.'],
    [133, 58, 64, 25, 36, 93, 11, 26, 'Small alert fox with mouth carrying and no throwing hands.'],
    [134, 71, 75, 60, 76, 80, 18, 34, 'Flexible aquatic quadruped; useful pursuit, limited passing control.'],
    [135, 77, 76, 65, 59, 100, 17, 34, 'Elite burst and reactions; still a quadruped without passing hands.'],
    [136, 73, 70, 83, 75, 86, 17, 32, 'Powerful fast fox; mouth carrying favors the backfield.'],
    [137, 70, 94, 38, 71, 69, 65, 80, 'Programmed reads and digital manipulation substitute partly for arms.'],
    [138, 39, 44, 24, 74, 6, 16, 25, 'Small tentacles can clasp; aquatic shell body has poor land footwork.'],
    [139, 60, 60, 66, 94, 9, 27, 38, 'Many tentacles and strong armor; very slow turf movement.'],
    [140, 14, 40, 35, 73, 17, 3, 13, 'Low shell crawler with small limbs unsuitable for a normal pass.'],
    [141, 37, 71, 87, 87, 90, 13, 27, 'Fast blade-armed hunter; dangerous tackle range, poor safe ball grip.'],
    [142, 76, 69, 88, 78, 100, 25, 40, 'Fast aerial hunter with talon catches but limited passing anatomy.'],
    [143, 78, 55, 98, 100, 45, 48, 66, 'Huge durable anchor and usable hands; short-area shuffling is better than its very slow 40.'],
    [144, 75, 87, 72, 83, 96, 33, 49, 'Disciplined aerial coverage; wings and talons limit throws.'],
    [145, 75, 83, 88, 81, 100, 29, 45, 'Explosive aerial pursuit and range; no independent throwing hand.'],
    [146, 75, 81, 92, 85, 98, 29, 45, 'Powerful aerial athlete; talon catches are better than passing release.'],
    [147, 20, 49, 34, 43, 50, 5, 15, 'Small armless serpent; coils help restraint, not passing.'],
    [148, 41, 81, 70, 72, 87, 19, 31, 'Graceful levitating serpent with good reads; no fine throwing limbs.'],
    [149, 92, 91, 98, 96, 98, 83, 94, 'Massive kind-handed flying biped; excellent leverage and all-around coordination.'],
    [150, 99, 100, 99, 95, 100, 99, 100, 'Elite intellect, hands and telekinetic precision; powerful athletic frame.'],
    [151, 98, 98, 81, 74, 100, 97, 100, 'Adaptable psychic control and agility overcome its small frame, not all contact limits.'],
    [152, 34, 54, 23, 37, 63, 10, 24, 'Small quadruped can carry with mouth or leaf, not throw conventionally.'],
    [153, 48, 64, 54, 65, 69, 18, 32, 'Sturdy plant quadruped; good discipline but limited arm mechanics.'],
    [154, 64, 83, 83, 91, 67, 29, 43, 'Strong composed plant blocker; vines offer some control without human-style release.'],
    [155, 48, 43, 24, 33, 73, 21, 35, 'Small forepaws and uncertain upright stance constrain throwing.'],
    [156, 61, 58, 57, 55, 95, 37, 51, 'Agile runner with forepaw control but inconsistent upright release.'],
    [157, 82, 73, 89, 86, 95, 65, 82, 'Powerful armed biped with burst and workable passing coordination.'],
    [158, 70, 43, 43, 58, 69, 47, 65, 'Handed young crocodilian; impulsive reads and modest accuracy.'],
    [159, 77, 55, 74, 77, 76, 53, 71, 'Strong hands and armor; better contact leverage than finesse.'],
    [160, 86, 74, 98, 94, 84, 66, 83, 'Massive agile biped with strong hands and a sturdy frame.'],
    [161, 52, 68, 25, 31, 58, 31, 47, 'Alert scout with small forepaws, short release and weak contact frame.'],
    [162, 71, 71, 58, 55, 97, 48, 64, 'Nimble long-bodied runner; forepaws can carry but precision throwing is modest.'],
    [163, 30, 73, 22, 43, 61, 13, 26, 'Excellent timing sense, but a small bird lacks passing mechanics.'],
    [164, 57, 93, 52, 66, 89, 26, 41, 'Wise aerial reader and tracker; talons do not deliver a standard pass.'],
    [165, 49, 46, 19, 36, 71, 27, 39, 'Several small limbs help possession, but very low throwing strength.'],
    [166, 77, 69, 54, 64, 92, 52, 68, 'Multiple coordinated hands support catches and good coverage movement.'],
    [167, 25, 49, 27, 39, 42, 10, 22, 'Small spider feet and web control favor coverage restraint over passing.'],
    [168, 43, 70, 69, 70, 59, 21, 34, 'Patient web hunter with tackler leverage but limited clean release.'],
    [169, 35, 81, 78, 72, 100, 13, 27, 'Exceptional pursuit flight; four wings still do not provide hands.'],
    [170, 0, 43, 24, 38, 3, 1, 6, 'Aquatic fish; antennae do not substitute for football arms and turf feet.'],
    [171, 0, 66, 53, 72, 3, 1, 8, 'Durable aquatic fish without football carrying or throwing anatomy.'],
    [172, 58, 38, 13, 19, 75, 37, 53, 'Small immature hands and balance; developing reactions and control.'],
    [173, 51, 44, 9, 21, 26, 33, 49, 'Tiny inexperienced biped with low leverage and contact tolerance.'],
    [174, 37, 29, 5, 27, 14, 18, 31, 'Tiny soft biped with very limited stable grip and movement.'],
    [175, 46, 42, 12, 43, 20, 27, 42, 'Tiny shell-backed infant; limbs and field awareness are developing.'],
    [176, 62, 77, 27, 53, 87, 43, 58, 'Gentle flying biped with small hands and little release leverage.'],
    [177, 29, 74, 13, 24, 67, 13, 27, 'Small prophetic bird; anticipation is strong but throwing anatomy is absent.'],
    [178, 57, 96, 42, 53, 72, 32, 47, 'Future sight helps coverage reads; bird hands remain limited.'],
    [179, 26, 47, 23, 46, 57, 5, 17, 'Woolly quadruped with no passing hands.'],
    [180, 61, 59, 48, 62, 57, 42, 59, 'Upright forelimbs offer workable possession and developing release.'],
    [181, 85, 83, 78, 81, 64, 74, 86, 'Composed handed biped; reliable coordination despite modest foot speed.'],
    [182, 69, 69, 22, 40, 29, 49, 65, 'Coordinated dancing limbs, tiny frame and limited passing range.'],
    [183, 56, 45, 22, 43, 42, 29, 44, 'Small handed swimmer; ball control is modest and turf burst limited.'],
    [184, 69, 62, 74, 78, 56, 43, 60, 'Strong rabbit-like biped with usable hands but only average passing finesse.'],
    [185, 65, 56, 73, 93, 33, 33, 51, 'Rock-hard upright body with branch hands; stiff release and footwork.'],
    [186, 84, 83, 64, 68, 78, 74, 85, 'Coordinated handed frog leader with good recognition and balance.'],
    [187, 15, 37, 5, 13, 22, 4, 14, 'Wind-dependent tiny plant; no stable grip or route control.'],
    [188, 25, 47, 12, 22, 35, 9, 20, 'Airborne plant with rudimentary grip and unreliable field movement.'],
    [189, 37, 64, 24, 37, 58, 18, 30, 'Wind awareness and drifting range, but low contact strength and no throwing arms.'],
    [190, 95, 70, 39, 47, 97, 71, 84, 'Dexterous hands and prehensile tail make an excellent small ball handler.'],
    [191, 0, 16, 3, 15, 1, 0, 4, 'Near-static seed with no arms or football locomotion.'],
    [192, 47, 44, 25, 41, 12, 17, 29, 'Leaf arms provide limited grip; planted body lacks power and mobility.'],
    [193, 28, 59, 39, 33, 100, 10, 22, 'Very agile aerial tracker with tiny limbs and no throwing arm.'],
    [194, 0, 32, 18, 41, 29, 0, 8, 'Armless juvenile amphibian; movement cannot provide passing mechanics.'],
    [195, 68, 40, 70, 88, 38, 35, 54, 'Durable handed biped; placid slow recognition is a quarterback weakness.'],
    [196, 84, 94, 55, 51, 98, 87, 93, 'Precise psychic control supplies ball handling despite quadrupedal anatomy.'],
    [197, 72, 85, 63, 94, 93, 18, 34, 'Intelligent durable fox; no established fine psychic release or arms.'],
    [198, 51, 83, 25, 31, 92, 24, 38, 'Clever aerial thief can snatch with feet, but throwing is limited.'],
    [199, 90, 100, 62, 86, 33, 96, 99, 'Brilliant tactical leader with precise hands/psychic control; slow running feet.'],
    [200, 62, 83, 36, 44, 97, 49, 66, 'Clever levitating ghost without clear hands; manipulation is weaker than Gengar.'],
    [201, 12, 49, 20, 35, 50, 7, 17, 'Floating glyph; psychic influence lacks fine throwing limbs and motor control.'],
    [202, 40, 32, 38, 98, 15, 9, 24, 'Excellent resilience and counters; passive behavior and short limbs hurt quarterback play.'],
    [203, 52, 80, 59, 62, 89, 26, 40, 'Alert two-headed quadruped with partial psychic aid, not precise hand control.'],
    [204, 0, 21, 29, 84, 1, 0, 5, 'Static armored cone without ball handling limbs.'],
    [205, 8, 49, 78, 100, 5, 1, 11, 'Heavy armored sphere; physical durability does not imply football grip or footwork.'],
    [206, 18, 39, 36, 65, 18, 7, 18, 'Low crawling serpent with tiny wings, no hands and poor agility.'],
    [207, 64, 70, 58, 79, 78, 36, 53, 'Claws allow carries and gliding coverage; pincers constrain fine release.'],
    [208, 14, 66, 100, 100, 40, 6, 17, 'Enormous metal serpent; elite trench anchor but no throwing arms.'],
    [209, 62, 47, 44, 49, 54, 34, 50, 'Handed small bulldog with limited poise and throwing finesse.'],
    [210, 76, 58, 94, 80, 66, 49, 67, 'Powerful armed biped with bite and contact strength.'],
    [211, 0, 43, 36, 59, 2, 0, 6, 'Spiny aquatic fish has no ball grip or turf locomotion.'],
    [212, 78, 84, 97, 97, 91, 56, 75, 'Steel-armored athlete; usable pincers catch well but limit passing accuracy.'],
    [213, 31, 59, 13, 100, 1, 9, 20, 'Almost stationary shell with thin tentacles; hard to hurt, easy to outmaneuver.'],
    [214, 78, 75, 100, 92, 90, 46, 67, 'Exceptional lifting leverage and charge power; modest throwing finesse.'],
    [215, 88, 78, 64, 53, 100, 57, 76, 'Clever fast clawed biped; precise possession but only moderate arm strength.'],
    [216, 76, 51, 33, 41, 57, 45, 62, 'Dexterous bear cub with limited size, awareness and leverage.'],
    [217, 88, 72, 98, 92, 84, 67, 83, 'Large powerful bear with hands, contact balance and good movement.'],
    [218, 5, 32, 22, 50, 2, 1, 7, 'Slow molten slug with no stable football grip or throwing limbs.'],
    [219, 9, 49, 60, 87, 1, 2, 10, 'Armored molten snail; near-static movement and no throwing arms.'],
    [220, 20, 35, 30, 43, 46, 4, 15, 'Small quadruped with no independent ball control limbs.'],
    [221, 35, 57, 86, 88, 62, 9, 22, 'Strong tusked quadruped; contact anchor with limited grip or passing release.'],
    [222, 10, 44, 24, 82, 3, 2, 10, 'Near-static coral body with no passing arms.'],
    [223, 0, 40, 28, 35, 2, 4, 7, 'Aimed water shots do not give a fish hands or land mobility.'],
    [224, 82, 73, 73, 71, 21, 65, 74, 'Dexterous tentacles and excellent aim; slow land positioning caps quarterback utility.'],
    [225, 75, 66, 24, 39, 62, 43, 61, 'Experienced parcel carrier with wing-assisted catches but modest throwing power.'],
    [226, 24, 70, 63, 82, 10, 8, 21, 'Large aquatic ray; gliding does not provide football hands or turf routes.'],
    [227, 51, 79, 86, 100, 95, 23, 39, 'Steel-winged coverage athlete; throwing grip remains avian and limited.'],
    [228, 61, 69, 40, 41, 96, 10, 25, 'Disciplined fast dog with no passing hands.'],
    [229, 75, 84, 77, 67, 99, 18, 33, 'Fast coordinated pack hunter; mouth carrying and intelligent pursuit.'],
    [230, 7, 85, 89, 93, 5, 17, 22, 'Powerful precise aquatic seahorse still lacks arms and turf footwork.'],
    [231, 54, 47, 58, 73, 61, 24, 38, 'Small prehensile trunk carries better than it throws; sturdy compact frame.'],
    [232, 68, 68, 98, 99, 82, 34, 49, 'Powerful armored runner with trunk carrying and tremendous blocking leverage.'],
    [233, 78, 99, 56, 82, 80, 76, 87, 'Improved computational reads and digital control; unconventional body limits mechanics.'],
    [234, 67, 67, 73, 65, 97, 13, 29, 'Agile horned quadruped with no independent throwing hands.'],
    [235, 97, 86, 42, 46, 63, 92, 95, 'Artist-level precision and practiced tail/hand control; low strength and durability.'],
    [236, 77, 46, 42, 44, 79, 41, 59, 'Young handed martial artist; developing strength and play recognition.'],
    [237, 80, 77, 87, 84, 96, 51, 73, 'Excellent balance and rotating footwork; hands and passing precision are secondary.'],
    [238, 60, 45, 14, 24, 25, 37, 53, 'Tiny humanoid with emerging psychic control but little leverage.'],
    [239, 72, 44, 37, 41, 78, 44, 61, 'Small dexterous electric biped with developing poise.'],
    [240, 62, 41, 36, 41, 63, 34, 50, 'Small armed biped with limited accuracy and contact maturity.'],
    [241, 86, 77, 85, 88, 85, 65, 81, 'Strong coordinated biped with hands and a robust running frame.'],
    [242, 93, 91, 42, 100, 51, 75, 88, 'Exceptional sure hands, awareness and resilience; limited contact force and burst.'],
    [243, 83, 89, 98, 91, 100, 22, 37, 'Powerful lightning-fast quadruped; elite rushing/pursuit but no throwing arms.'],
    [244, 82, 86, 100, 96, 99, 22, 37, 'Huge quick quadruped; dominant contact runner with an anatomical passing cap.'],
    [245, 86, 97, 90, 92, 100, 31, 43, 'Graceful intelligent quadruped with secure carrying, not fine arm mechanics.'],
    [246, 65, 43, 57, 73, 49, 32, 48, 'Dense young biped with hands, undeveloped reads and slow footwork.'],
    [247, 0, 37, 73, 96, 27, 0, 9, 'Armored cocoon may propel itself, but has no throwing arms or ball grip.'],
    [248, 77, 77, 100, 100, 58, 52, 72, 'Massive armored biped; tremendous trench leverage, ordinary passing finesse.'],
    [249, 86, 97, 99, 99, 96, 80, 91, 'Highly intelligent psychic flyer with large hand-like wings and substantial control.'],
    [250, 66, 93, 100, 96, 97, 42, 59, 'Powerful wise bird; superb aerial range, limited wing-based passing mechanics.'],
    [251, 95, 99, 61, 66, 98, 93, 98, 'Precise psychic hands and excellent anticipation; small frame still limits line play.']
  ];

  const roles = Object.freeze(['LT', 'LG', 'C', 'RG', 'RT', 'QB', 'HB', 'FB', 'WR', 'TE', 'FS', 'SS', 'CB', 'DE', 'NT', 'DT', 'ILB', 'OLB', 'MLB', 'WLB', 'SLB', 'LB', 'NB', 'DB']);
  const catalog = window.POKEMON;
  if (!Array.isArray(catalog) || catalog.length !== 251) throw new Error('Draft ratings require the complete 251-Pokémon catalog.');
  const catalogById = new Map(catalog.map(p => [p.id, p]));
  if (catalogById.size !== 251 || profiles.length !== 251) throw new Error('Incomplete Pokémon scouting coverage.');
  const clamp = n => Math.max(0, Math.min(100, n));
  const mix = (...terms) => terms.reduce((total, [value, weight]) => total + value * weight, 0);
  const matrix = new Map();

  for (const [id, control, awareness, strength, durability, mobility, accuracy, qbCeiling] of profiles) {
    const p = catalogById.get(id);
    if (!p || matrix.has(id) || ![p.heightMeters, p.weightKg, p.fortySeconds].every(n => Number.isFinite(n) && n > 0) ||
        ![control, awareness, strength, durability, mobility, accuracy, qbCeiling].every(n => Number.isInteger(n) && n >= 0 && n <= 100)) {
      throw new Error('Missing, duplicate or invalid Pokémon physical profile: ' + id);
    }
    // Saturation keeps huge serpents from gaining unlimited reach, and very low
    // mass does not erase explicitly reviewed supernatural functional strength.
    const mass = clamp(45 + Math.log2(p.weightKg / 18) * 15);
    const reach = clamp(p.heightMeters * 45);
    const frame = mass * .70 + reach * .30;
    const power = strength * .86 + frame * .14;
    const contact = durability * .92 + mass * .08;
    const speed = clamp(100 * Math.exp(-(p.fortySeconds - 2.65) / 5.1));
    // Mobility is species-reviewed turf/flight agility. A burrower or floating
    // cocoon does not receive a fast backfield grade just from estimated 40 time.
    const movement = mobility * .70 + speed * .30;
    const handFactor = .55 + .45 * control / 100;
    const coverControl = Math.min(100, control + 16); // Deflections need less grip than receptions.
    // Weight and armor alone cannot make a stationary cocoon or water-bound fish
    // an elite blocker: trenches still require stance changes and short-area feet.
    const trenchFootwork = .65 + .35 * Math.min(1, mobility / 45);

    const qb = Math.min(qbCeiling, mix([control, .26], [awareness, .27], [accuracy, .25], [power, .12], [movement, .05], [reach, .05]));
    const hb = mix([speed, .23], [movement, .24], [power, .15], [contact, .13], [control, .19], [frame, .06]) * handFactor;
    const fb = mix([power, .28], [contact, .23], [frame, .15], [movement, .12], [control, .16], [awareness, .06]) * handFactor;
    const wr = mix([speed, .23], [movement, .17], [control, .30], [awareness, .14], [reach, .11], [contact, .05]) * handFactor;
    const te = mix([frame, .20], [control, .26], [power, .19], [contact, .14], [movement, .10], [awareness, .07], [speed, .04]) * handFactor;
    // Linemen can block with an unconventional body, but centers must reliably
    // snap. Hand control therefore matters more at C than guard or tackle.
    const tackle = mix([power, .29], [contact, .22], [frame, .23], [movement, .13], [awareness, .08], [control, .05]) * trenchFootwork;
    const guard = mix([power, .32], [contact, .25], [frame, .25], [movement, .06], [awareness, .07], [control, .05]) * trenchFootwork;
    const center = mix([power, .23], [contact, .19], [frame, .19], [control, .22], [awareness, .14], [movement, .03]) * (.65 + .35 * control / 100) * trenchFootwork;
    const de = mix([power, .30], [contact, .17], [frame, .14], [movement, .20], [speed, .11], [awareness, .08]) * trenchFootwork;
    const dt = mix([power, .34], [contact, .28], [frame, .26], [movement, .07], [awareness, .05]) * trenchFootwork;
    const nt = mix([power, .31], [contact, .31], [frame, .30], [movement, .03], [awareness, .05]) * trenchFootwork;
    const linebacker = mix([power, .19], [contact, .14], [movement, .21], [speed, .13], [awareness, .20], [coverControl, .08], [frame, .05]);
    const outside = mix([power, .22], [contact, .12], [movement, .24], [speed, .17], [awareness, .16], [coverControl, .06], [frame, .03]);
    const inside = mix([power, .22], [contact, .18], [movement, .17], [speed, .09], [awareness, .22], [coverControl, .07], [frame, .05]);
    const cb = mix([speed, .26], [movement, .25], [awareness, .20], [coverControl, .16], [reach, .08], [contact, .05]);
    const fs = mix([speed, .23], [movement, .19], [awareness, .31], [coverControl, .15], [reach, .06], [contact, .06]);
    const ss = mix([power, .12], [contact, .14], [movement, .21], [speed, .16], [awareness, .22], [coverControl, .10], [frame, .05]);
    const grades = {
      LT: tackle, LG: guard, C: center, RG: guard, RT: tackle, QB: qb,
      HB: hb, FB: fb, WR: wr, TE: te, FS: fs, SS: ss, CB: cb,
      DE: de, DT: dt, NT: nt, ILB: inside, OLB: outside, MLB: inside,
      WLB: outside * .70 + linebacker * .30,
      SLB: inside * .45 + outside * .55,
      LB: linebacker, NB: cb * .70 + ss * .30, DB: cb * .55 + fs * .45
    };
    // A secure mouth/talon carry does not automatically imply a reliable snap.
    // Limited arm/release anatomy also constrains center, even on a huge body.
    if (qbCeiling < 40) grades.C = Math.min(grades.C, control < 20 ? 35 : 59);
    const openFieldMobility = .55 + .45 * Math.min(1, mobility / 50);
    for (const role of ['HB', 'FB', 'WR', 'TE', 'FS', 'SS', 'CB', 'ILB', 'OLB', 'MLB', 'WLB', 'SLB', 'LB', 'NB', 'DB']) {
      grades[role] *= openFieldMobility;
    }
    // A centered scale leaves clear differences between competent, outstanding
    // and anatomically unsuitable picks, instead of clustering the roster at C.
    for (const role of roles) grades[role] = Math.round(clamp(grades[role]));
    matrix.set(id, Object.freeze(grades));
  }

  // Fail early if future catalog edits ever omit a species or board role.
  for (let id = 1; id <= 251; id++) {
    const grades = matrix.get(id);
    if (!grades || roles.some(role => !Number.isInteger(grades[role]) || grades[role] < 0 || grades[role] > 100)) {
      throw new Error('Incomplete positional grades: ' + id);
    }
  }

  window.DraftRatings = Object.freeze({
    roles,
    rate(id, role) {
      if (!Number.isInteger(id) || !matrix.has(id)) throw new RangeError('Unknown Pokémon ID for positional grade.');
      if (!roles.includes(role)) throw new RangeError('Unknown football position for positional grade.');
      return matrix.get(id)[role];
    }
  });
})();
