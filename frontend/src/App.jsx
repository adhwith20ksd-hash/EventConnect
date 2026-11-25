
import { useEffect, useState } from 'react'
import './App.css'

const API_URL = 'http://127.0.0.1:8000/api'

// Load Razorpay Checkout
const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true)
      return
    }

    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

function App() {
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [ticketTypes, setTicketTypes] = useState([])
  const [loading, setLoading] = useState(true)

  // Authentication
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [authMessage, setAuthMessage] = useState('')

  // Booking and payment
  const [quantity, setQuantity] = useState(1)
  const [message, setMessage] = useState('')
  const [bookings, setBookings] = useState([])
  const [paymentLoading, setPaymentLoading] = useState(false)

  // Organizer Dashboard
  const [dashboard, setDashboard] = useState(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState('')

  // Admin Dashboard
  const [adminDashboard, setAdminDashboard] = useState(null)
  const [adminDashboardLoading, setAdminDashboardLoading] = useState(false)
  const [adminDashboardError, setAdminDashboardError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  // Load events
  useEffect(() => {
    fetch(`${API_URL}/events/`)
      .then(response => {
        if (!response.ok) throw new Error('Could not load events')
        return response.json()
      })
      .then(data => {
        setEvents(Array.isArray(data) ? data : data.results || [])
      })
      .catch(error => console.error(error))
      .finally(() => setLoading(false))
  }, [])

  // Load ticket types
  useEffect(() => {
    if (!selectedEvent) return

    fetch(`${API_URL}/ticket-types/?event=${selectedEvent.id}`)
      .then(response => {
        if (!response.ok) throw new Error('Could not load tickets')
        return response.json()
      })
      .then(data => {
        setTicketTypes(Array.isArray(data) ? data : data.results || [])
      })
      .catch(error => {
        console.error(error)
        setTicketTypes([])
      })
  }, [selectedEvent])

  // Login
  const handleLogin = async (e) => {
    e.preventDefault()
    setAuthMessage('')

    try {
      const response = await fetch(`${API_URL}/accounts/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.detail || 'Login failed')
      }

      setToken(data.token)
      setAuthMessage('Login successful!')
      setPassword('')

      // Check whether the logged-in user is an admin
      await loadAdminDashboard(data.token)

    } catch (error) {
      setAuthMessage(error.message)
    }
  }

  // Logout
  const handleLogout = () => {
    setToken('')
    setBookings([])
    setDashboard(null)
    setDashboardError('')
    setMessage('You have logged out.')
    setAuthMessage('')
    setAdminDashboard(null)
    setIsAdmin(false)
    setAdminDashboardError('')
  }

  // Refresh ticket availability
  const refreshTickets = async () => {
    if (!selectedEvent) return

    const response = await fetch(
      `${API_URL}/ticket-types/?event=${selectedEvent.id}`
    )

    if (response.ok) {
      const data = await response.json()
      setTicketTypes(Array.isArray(data) ? data : data.results || [])
    }
  }

  // Load booking history
  const loadBookings = async () => {
    if (!token) {
      setMessage('Please log in first.')
      return
    }

    try {
      const response = await fetch(`${API_URL}/bookings/`, {
        headers: {
          Authorization: `Token ${token}`
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not load bookings')
      }

      setBookings(Array.isArray(data) ? data : data.results || [])

    } catch (error) {
      setMessage(error.message)
    }
  }

  // Load Organizer Dashboard
  const loadOrganizerDashboard = async () => {
    if (!token) {
      setDashboardError('Please log in first.')
      return
    }

    setDashboardLoading(true)
    setDashboardError('')

    try {
      const response = await fetch(
        `${API_URL}/dashboard/organizer/`,
        {
          headers: {
            Authorization: `Token ${token}`
          }
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.detail || 'Could not load organizer dashboard'
        )
      }

      setDashboard(data)

    } catch (error) {
      setDashboardError(error.message)
    } finally {
      setDashboardLoading(false)
    }
  }

  // Load Admin Dashboard
  const loadAdminDashboard = async (authToken = token) => {
    if (!authToken) return

    setAdminDashboardLoading(true)
    setAdminDashboardError('')

    try {
      const response = await fetch(
        `${API_URL}/dashboard/admin/`,
        {
          headers: {
            Authorization: `Token ${authToken}`
          }
        }
      )

      const data = await response.json()

      if (response.status === 403) {
        setIsAdmin(false)
        setAdminDashboard(null)
        return
      }

      if (!response.ok) {
        throw new Error(
          data.detail || 'Could not load admin dashboard'
        )
      }

      setIsAdmin(true)
      setAdminDashboard(data)

    } catch (error) {
      setAdminDashboardError(error.message)
    } finally {
      setAdminDashboardLoading(false)
    }
  }

  // Cancel a pending booking if payment is abandoned
  const cancelPendingBooking = async (bookingId) => {
    const response = await fetch(`${API_URL}/bookings/payment-failed/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${token}`
      },
      body: JSON.stringify({
        booking_id: bookingId
      })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Could not cancel pending booking')
    }

    return data
  }

  // Book ticket and open Razorpay Checkout
  const handleBooking = async (ticketId) => {
    if (!token) {
      setMessage('Please log in before booking tickets.')
      document.getElementById('login')?.scrollIntoView({
        behavior: 'smooth'
      })
      return
    }

    if (!Number.isInteger(Number(quantity)) || Number(quantity) < 1) {
      setMessage('Please enter a valid quantity.')
      return
    }

    setPaymentLoading(true)
    setMessage('Creating your payment order...')

    let bookingId = null

    try {
      // Step 1: Create Razorpay order through Django
      const response = await fetch(`${API_URL}/bookings/create-order/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${token}`
        },
        body: JSON.stringify({
          ticket_type_id: ticketId,
          quantity: Number(quantity)
        })
      })

      const orderData = await response.json()

      if (!response.ok) {
        throw new Error(orderData.error || 'Could not create payment order')
      }

      bookingId = orderData.booking_id

      // Step 2: Load Razorpay Checkout
      const scriptLoaded = await loadRazorpayScript()

      if (!scriptLoaded) {
        await cancelPendingBooking(bookingId)
        throw new Error('Could not load Razorpay Checkout. Please try again.')
      }

      let paymentCompleted = false
      let failureHandled = false

      // Handle failed or dismissed payment
      const handlePaymentFailure = async (failureMessage) => {
        if (paymentCompleted || failureHandled) return

        failureHandled = true

        try {
          await cancelPendingBooking(bookingId)
          setMessage(
            `${failureMessage} Your pending booking was cancelled and tickets were restored.`
          )
          await refreshTickets()
          await loadBookings()
        } catch (error) {
          setMessage(error.message)
        } finally {
          setPaymentLoading(false)
        }
      }

      // Step 3: Razorpay Checkout options
      const options = {
        key: orderData.razorpay_key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'EventConnect',
        description: `${orderData.event} - ${orderData.ticket}`,
        order_id: orderData.razorpay_order_id,

        prefill: {
          name: username
        },

        notes: {
          booking_id: String(orderData.booking_id)
        },

        handler: async function (paymentResponse) {
          paymentCompleted = true
          setMessage('Payment received. Verifying your payment...')

          try {
            // Step 4: Verify payment signature with Django
            const verifyResponse = await fetch(
              `${API_URL}/bookings/verify-payment/`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Token ${token}`
                },
                body: JSON.stringify({
                  booking_id: orderData.booking_id,
                  razorpay_order_id: paymentResponse.razorpay_order_id,
                  razorpay_payment_id: paymentResponse.razorpay_payment_id,
                  razorpay_signature: paymentResponse.razorpay_signature
                })
              }
            )

            const verifyData = await verifyResponse.json()

            if (!verifyResponse.ok) {
              throw new Error(
                verifyData.error ||
                'Payment verification failed. Please contact support.'
              )
            }

            // Step 5: Booking confirmed and QR generated
            setMessage(
              `Payment successful! Booking #${verifyData.booking_id} is confirmed. Your QR ticket is ready.`
            )

            setQuantity(1)

            await refreshTickets()
            await loadBookings()

          } catch (error) {
            setMessage(
              `${error.message} Do not retry payment immediately. Please contact the event administrator with your booking ID: ${orderData.booking_id}.`
            )
          } finally {
            setPaymentLoading(false)
          }
        },

        modal: {
          ondismiss: () => {
            handlePaymentFailure('Payment window closed.')
          }
        },

        theme: {
          color: '#3399cc'
        }
      }

      const razorpay = new window.Razorpay(options)

      razorpay.on('payment.failed', function (paymentResponse) {
        const failureMessage =
          paymentResponse.error?.description || 'Payment failed.'

        handlePaymentFailure(failureMessage)
      })

      razorpay.open()

    } catch (error) {
      setMessage(error.message)

      // Release reserved tickets if checkout setup failed
      if (bookingId) {
        try {
          await cancelPendingBooking(bookingId)
          await refreshTickets()
          await loadBookings()
        } catch (cancelError) {
          console.error(cancelError)
        }
      }

      setPaymentLoading(false)
    }
  }

  // Cancel pending booking from booking history
  const handleCancel = async (bookingId) => {
    try {
      const response = await fetch(
        `${API_URL}/bookings/payment-failed/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Token ${token}`
          },
          body: JSON.stringify({
            booking_id: bookingId
          })
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Cancellation failed')
      }

      setMessage(`Pending booking #${bookingId} cancelled successfully.`)

      await loadBookings()
      await refreshTickets()

    } catch (error) {
      setMessage(error.message)
    }
  }

  return (
    <div>
      {/* Navbar */}
      <nav className="navbar">
        <h2>EventConnect</h2>

        <div>
          <a href="/">Home</a>
          <a href="#events">Events</a>
          <a href="#login">Login</a>

          {token && (
            <>
              <a href="#bookings" onClick={loadBookings}>
                My Bookings
              </a>

              <a
                href="#dashboard"
                onClick={loadOrganizerDashboard}
              >
                Organizer Dashboard
              </a>

              {isAdmin && (
                <a
                  href="#admin-dashboard"
                  onClick={() => loadAdminDashboard()}
                >
                  Admin Dashboard
                </a>
              )}
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <h1>Discover Amazing Events</h1>
        <p>
          Find events, book tickets, and create unforgettable memories.
        </p>

        <button onClick={() =>
          document.getElementById('events').scrollIntoView({
            behavior: 'smooth'
          })
        }>
          Explore Events
        </button>
      </section>

      {/* Login Section */}
      <section id="login" className="events">
        <h2>Account Login</h2>

        {token ? (
          <div>
            <p>You are logged in as {username}.</p>
            <button onClick={handleLogout}>Logout</button>
            <button onClick={loadBookings}>View My Bookings</button>
          </div>
        ) : (
          <form onSubmit={handleLogin}>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />

            <button type="submit">Login</button>
          </form>
        )}

        {authMessage && <p>{authMessage}</p>}
      </section>

      {/* Events Section */}
      <section id="events" className="events">
        {selectedEvent ? (
          <div className="event-detail">
            <button onClick={() => {
              setSelectedEvent(null)
              setMessage('')
            }}>
              Back to Events
            </button>

            <h2>{selectedEvent.title}</h2>
            <p>{selectedEvent.description}</p>
            <p><strong>Location:</strong> {selectedEvent.location}</p>

            <p>
              <strong>Date:</strong>{' '}
              {new Date(selectedEvent.date).toLocaleString('en-IN')}
            </p>

            <p>
              <strong>Organizer:</strong> {selectedEvent.organizer}
            </p>

            <h3>Available Tickets</h3>

            {ticketTypes.length === 0 ? (
              <p>No ticket types available for this event yet.</p>
            ) : (
              ticketTypes.map(ticket => (
                <div className="ticket-card" key={ticket.id}>
                  <h4>{ticket.name}</h4>
                  <p>Price: ₹{ticket.price}</p>
                  <p>Available: {ticket.available_quantity}</p>

                  <label>
                    Quantity:
                    <input
                      type="number"
                      min="1"
                      max={ticket.available_quantity}
                      value={quantity}
                      onChange={e => setQuantity(Number(e.target.value))}
                    />
                  </label>

                  <button
                    disabled={
                      ticket.available_quantity === 0 || paymentLoading
                    }
                    onClick={() => handleBooking(ticket.id)}
                  >
                    {paymentLoading
                      ? 'Processing...'
                      : ticket.available_quantity > 0
                        ? 'Book & Pay'
                        : 'Sold Out'}
                  </button>
                </div>
              ))
            )}
          </div>
        ) : (
          <>
            <h2>Upcoming Events</h2>

            {loading ? (
              <p>Loading events...</p>
            ) : events.length === 0 ? (
              <p>No events available yet.</p>
            ) : (
              <div className="event-container">
                {events.map(event => (
                  <div className="event-card" key={event.id}>
                    {event.poster && (
                      <img
                        src={
                          event.poster.startsWith('http')
                            ? event.poster
                            : `http://127.0.0.1:8000${event.poster}`
                        }
                        alt={event.title}
                        className="event-poster"
                      />
                    )}

                    <div className="event-details">
                      <h3>{event.title}</h3>
                      <p>{event.description}</p>

                      <p>
                        <strong>Location:</strong> {event.location}
                      </p>

                      <p>
                        <strong>Date:</strong>{' '}
                        {new Date(event.date).toLocaleDateString('en-IN')}
                      </p>

                      <button onClick={() => {
                        setSelectedEvent(event)
                        setMessage('')
                      }}>
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Booking Message */}
      {message && (
        <section className="events">
          <p>{message}</p>
        </section>
      )}

      {/* Organizer Dashboard */}
      {token && (
        <section id="dashboard" className="events">
          <h2>Organizer Dashboard</h2>

          <button
            onClick={loadOrganizerDashboard}
            disabled={dashboardLoading}
          >
            {dashboardLoading ? 'Loading...' : 'Refresh Dashboard'}
          </button>

          {dashboardLoading && <p>Loading dashboard...</p>}

          {dashboardError && (
            <p>{dashboardError}</p>
          )}

          {dashboard && (
            <div className="event-container">
              <div className="ticket-card">
                <h3>Total Events</h3>
                <h2>{dashboard.total_events}</h2>
              </div>

              <div className="ticket-card">
                <h3>Total Bookings</h3>
                <h2>{dashboard.total_bookings}</h2>
              </div>

              <div className="ticket-card">
                <h3>Confirmed Bookings</h3>
                <h2>{dashboard.confirmed_bookings}</h2>
              </div>

              <div className="ticket-card">
                <h3>Pending Bookings</h3>
                <h2>{dashboard.pending_bookings}</h2>
              </div>

              <div className="ticket-card">
                <h3>Cancelled Bookings</h3>
                <h2>{dashboard.cancelled_bookings}</h2>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Admin Dashboard */}
      {token && isAdmin && (
        <section id="admin-dashboard" className="events">
          <h2>Admin Dashboard</h2>

          <button
            onClick={() => loadAdminDashboard()}
            disabled={adminDashboardLoading}
          >
            {adminDashboardLoading
              ? 'Loading...'
              : 'Refresh Admin Dashboard'}
          </button>

          {adminDashboardLoading && (
            <p>Loading admin dashboard...</p>
          )}

          {adminDashboardError && (
            <p>{adminDashboardError}</p>
          )}

          {adminDashboard && (
            <div className="event-container">

              <div className="ticket-card">
                <h3>Total Users</h3>
                <h2>{adminDashboard.total_users}</h2>
              </div>

              <div className="ticket-card">
                <h3>Total Events</h3>
                <h2>{adminDashboard.total_events}</h2>
              </div>

              <div className="ticket-card">
                <h3>Total Bookings</h3>
                <h2>{adminDashboard.total_bookings}</h2>
              </div>

              <div className="ticket-card">
                <h3>Confirmed Bookings</h3>
                <h2>{adminDashboard.confirmed_bookings}</h2>
              </div>

              <div className="ticket-card">
                <h3>Pending Bookings</h3>
                <h2>{adminDashboard.pending_bookings}</h2>
              </div>

              <div className="ticket-card">
                <h3>Cancelled Bookings</h3>
                <h2>{adminDashboard.cancelled_bookings}</h2>
              </div>

              <div className="ticket-card">
                <h3>Total Revenue</h3>
                <h2>
                  ₹{Number(adminDashboard.total_revenue).toFixed(2)}
                </h2>
              </div>

            </div>
          )}
        </section>
      )}

      {/* Booking History */}
      {token && (
        <section id="bookings" className="events">
          <h2>My Bookings</h2>

          <button onClick={loadBookings}>
            Refresh Booking History
          </button>

          {bookings.length === 0 ? (
            <p>No bookings loaded. Click Refresh Booking History.</p>
          ) : (
            bookings.map(booking => (
              <div className="ticket-card" key={booking.id}>
                <h3>{booking.event}</h3>

                <p>Booking ID: {booking.id}</p>
                <p>Ticket: {booking.ticket}</p>
                <p>Quantity: {booking.quantity}</p>
                <p>Total: ₹{booking.total_amount}</p>
                <p>Status: {booking.status}</p>

                <p>
                  <strong>Ticket Code:</strong> {booking.ticket_code}
                </p>

                {booking.qr_code ? (
                  <div>
                    <h4>Your QR Ticket</h4>

                    <img
                      src={booking.qr_code}
                      alt="Booking QR Code"
                      style={{
                        width: '180px',
                        height: '180px',
                        objectFit: 'contain'
                      }}
                    />
                  </div>
                ) : (
                  <p>QR code not generated yet.</p>
                )}

                {booking.status === 'PENDING' && (
                  <button onClick={() => handleCancel(booking.id)}>
                    Cancel Pending Booking
                  </button>
                )}

                {booking.status === 'CONFIRMED' && (
                  <p>
                    Payment confirmed. Refunds are not yet available through
                    this application.
                  </p>
                )}
              </div>
            ))
          )}
        </section>
      )}

      {/* Footer */}
      <footer>
        <p>© 2026 EventConnect. All rights reserved.</p>
      </footer>
    </div>
  )
}

export default App
